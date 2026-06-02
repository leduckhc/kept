import { state } from './state';
import { snoozePresets, doSnooze } from './snooze';
import { type ActionDeps, doMarkRead, accountFor } from './actions';
import { formatDate, toDatetimeLocal } from './helpers';
import { archiveThread, unarchiveThread, trashThread, untrashThread, loadThreads } from './gmail';
import { pushUndo } from './undoStack';
import { showToast } from './toasts';
import { icon } from './icons';

export function toggleBulkMode(renderInbox: () => void) {
  state.bulkMode = !state.bulkMode;
  if (!state.bulkMode) {
    state.selectedIds.clear();
    removeBulkBar();
  }
  renderInbox();
}

export function exitBulkMode(renderInbox: () => void) {
  state.bulkMode = false;
  state.selectedIds.clear();
  removeBulkBar();
  renderInbox();
}

export function toggleBulkSelection(id: string, updateBulkBar: () => void, shiftKey = false) {
  if (shiftKey && state.lastBulkSelectedId) {
    // Range select: find all visible thread rows between last and current
    const rows = Array.from(document.querySelectorAll<HTMLElement>('.thread-row[data-id]'));
    const ids = rows.map(r => r.dataset.id!);
    const startIdx = ids.indexOf(state.lastBulkSelectedId);
    const endIdx = ids.indexOf(id);
    if (startIdx !== -1 && endIdx !== -1) {
      const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
      for (let i = from; i <= to; i++) {
        const rid = ids[i];
        state.selectedIds.add(rid);
        const row = rows[i];
        row.classList.add('bulk-selected');
      }
      state.lastBulkSelectedId = id;
      updateBulkBar();
      return;
    }
  }
  // Normal toggle
  if (state.selectedIds.has(id)) {
    state.selectedIds.delete(id);
  } else {
    state.selectedIds.add(id);
  }
  state.lastBulkSelectedId = id;
  const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${id}"]`);
  if (row) {
    row.classList.toggle('bulk-selected', state.selectedIds.has(id));
  }
  updateBulkBar();
}

export function removeBulkBar() {
  document.getElementById('bulk-bar')?.remove();
}

export function updateBulkBar(
  getActionDeps: () => ActionDeps,
  exitBulkModeFn: () => void,
  _openBulkSnoozePickerFn: (ids: string[], row: HTMLElement) => void,
) {
  removeBulkBar();
  if (state.selectedIds.size === 0) return;

  const bar = document.createElement('div');
  bar.id = 'bulk-bar';
  bar.className = 'bulk-bar';
  bar.innerHTML = `
    <button class="bulk-cancel-btn" id="bulk-cancel">${icon.close('16px')}</button>
    <span class="bulk-count">${state.selectedIds.size} selected</span>
    <button class="bulk-action-btn" id="bulk-archive">Archive</button>
    <button class="bulk-action-btn" id="bulk-trash">Trash</button>
    <button class="bulk-action-btn" id="bulk-read">Mark Read</button>
  `;

  const toolbar = document.querySelector('.toolbar');
  if (toolbar) {
    toolbar.appendChild(bar);
  } else {
    document.body.appendChild(bar);
  }

  document.getElementById('bulk-archive')!.addEventListener('click', async () => {
    const ids = Array.from(state.selectedIds);
    const threads = ids.map(id => state.threads.find(x => x.id === id)).filter(Boolean) as typeof state.threads;
    const deps = getActionDeps();
    for (const t of threads) {
      const acct = accountFor(t);
      if (!acct) continue;
      await archiveThread(acct, t);
      document.querySelector<HTMLElement>(`.thread-row[data-id="${t.id}"]`)?.remove();
      state.threads = state.threads.filter(x => x.id !== t.id);
    }
    pushUndo(`Archived ${threads.length} thread${threads.length !== 1 ? 's' : ''}`, async () => {
      for (const t of threads) {
        const acct = accountFor(t);
        if (acct) await unarchiveThread(acct, t);
      }
      state.threads = state.unifiedMode ? await deps.loadUnifiedThreads() : await loadThreads(state.account!.id);
      deps.renderInbox();
    });
    showToast(`Archived ${threads.length} thread${threads.length !== 1 ? 's' : ''}`);
    exitBulkModeFn();
  });

  document.getElementById('bulk-trash')!.addEventListener('click', async () => {
    const ids = Array.from(state.selectedIds);
    const threads = ids.map(id => state.threads.find(x => x.id === id)).filter(Boolean) as typeof state.threads;
    const deps = getActionDeps();
    for (const t of threads) {
      const acct = accountFor(t);
      if (!acct) continue;
      await trashThread(acct, t);
      document.querySelector<HTMLElement>(`.thread-row[data-id="${t.id}"]`)?.remove();
      state.threads = state.threads.filter(x => x.id !== t.id);
    }
    pushUndo(`Trashed ${threads.length} thread${threads.length !== 1 ? 's' : ''}`, async () => {
      for (const t of threads) {
        const acct = accountFor(t);
        if (acct) await untrashThread(acct, t);
      }
      state.threads = state.unifiedMode ? await deps.loadUnifiedThreads() : await loadThreads(state.account!.id);
      deps.renderInbox();
    });
    showToast(`Moved ${threads.length} thread${threads.length !== 1 ? 's' : ''} to trash`);
    exitBulkModeFn();
  });

  document.getElementById('bulk-read')!.addEventListener('click', async () => {
    const ids = Array.from(state.selectedIds);
    for (const id of ids) {
      const t = state.threads.find(x => x.id === id);
      if (!t) continue;
      const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${id}"]`);
      if (row) await doMarkRead(t, row, getActionDeps());
    }
    exitBulkModeFn();
  });

  document.getElementById('bulk-cancel')!.addEventListener('click', () => exitBulkModeFn());
}

export function openBulkSnoozePicker(ids: string[], anchorRow: HTMLElement, exitBulkModeFn: () => void) {
  document.getElementById('snooze-picker')?.remove();

  const presets = snoozePresets();
  const now = new Date();
  const defaultDt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);
  const dtLocal = toDatetimeLocal(defaultDt);

  const picker = document.createElement('div');
  picker.id = 'snooze-picker';
  picker.className = 'snooze-picker';
  picker.innerHTML = `
    <div class="snooze-picker-header">
      <span>Snooze ${ids.length} threads until…</span>
      <button class="btn-icon snooze-picker-close" aria-label="Close">${icon.close('16px')}</button>
    </div>
    <div class="snooze-presets">
      ${presets.map((p, i) => `
        <button class="snooze-preset-btn" data-idx="${i}">
          <span class="snooze-preset-label">${p.label}</span>
          <span class="snooze-preset-time">${formatDate(p.untilMs())}</span>
        </button>`).join('')}
    </div>
    <div class="snooze-custom">
      <label class="snooze-custom-label">Custom date &amp; time</label>
      <input type="datetime-local" id="snooze-dt" class="snooze-dt-input" value="${dtLocal}" />
      <div id="snooze-dt-error" class="snooze-dt-error" style="display:none">Pick a future time</div>
      <button class="btn-primary snooze-confirm-btn" id="snooze-confirm" disabled>Snooze</button>
    </div>
  `;

  document.body.appendChild(picker);

  const rowRect = anchorRow.getBoundingClientRect();
  picker.style.top = `${Math.min(rowRect.bottom + 4, window.innerHeight - 320)}px`;
  picker.style.left = `${Math.max(8, Math.min(rowRect.left, window.innerWidth - 280))}px`;

  picker.querySelector('.snooze-picker-close')!.addEventListener('click', () => picker.remove());

  let selectedPresetMs: number | null = null;
  const confirmBtn = document.getElementById('snooze-confirm') as HTMLButtonElement;

  picker.querySelectorAll<HTMLButtonElement>('.snooze-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      picker.querySelectorAll('.snooze-preset-btn').forEach(b => b.classList.remove('snooze-preset-btn--active'));
      btn.classList.add('snooze-preset-btn--active');
      const idx = parseInt(btn.dataset.idx!);
      selectedPresetMs = presets[idx].untilMs();
      confirmBtn.disabled = false;
    });
  });

  async function applyBulkSnooze(untilMs: number) {
    for (const id of ids) {
      const t = state.threads.find(x => x.id === id);
      if (!t) continue;
      const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${id}"]`);
      if (row) await doSnooze(t, row, untilMs);
    }
    picker.remove();
    exitBulkModeFn();
  }

  confirmBtn.addEventListener('click', async () => {
    const input = document.getElementById('snooze-dt') as HTMLInputElement;
    const errorEl = document.getElementById('snooze-dt-error')!;
    if (selectedPresetMs !== null) {
      await applyBulkSnooze(selectedPresetMs);
      return;
    }
    const val = input.value;
    if (!val) { errorEl.style.display = ''; return; }
    const chosen = new Date(val).getTime();
    if (chosen <= Date.now()) {
      errorEl.style.display = '';
      errorEl.textContent = 'Must be a future time';
      return;
    }
    errorEl.style.display = 'none';
    await applyBulkSnooze(chosen);
  });

  (document.getElementById('snooze-dt') as HTMLInputElement).addEventListener('change', () => {
    const inp = document.getElementById('snooze-dt') as HTMLInputElement;
    const errorEl = document.getElementById('snooze-dt-error')!;
    picker.querySelectorAll('.snooze-preset-btn').forEach(b => b.classList.remove('snooze-preset-btn--active'));
    selectedPresetMs = null;
    const chosen = new Date(inp.value).getTime();
    if (chosen <= Date.now()) {
      errorEl.style.display = '';
      errorEl.textContent = 'Must be a future time';
      confirmBtn.disabled = true;
    } else {
      errorEl.style.display = 'none';
      confirmBtn.disabled = false;
    }
  });

  function dismiss(e: MouseEvent | KeyboardEvent) {
    if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
    if (e instanceof MouseEvent && picker.contains(e.target as Node)) return;
    picker.remove();
    document.removeEventListener('click', dismiss as EventListener);
    document.removeEventListener('keydown', dismiss as EventListener);
  }
  setTimeout(() => {
    document.addEventListener('click', dismiss as EventListener);
    document.addEventListener('keydown', dismiss as EventListener);
  }, 0);
}
