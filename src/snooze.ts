import { type Thread, loadThreads, snoozeThread, unsnoozeThread } from './store';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { formatDate, toDatetimeLocal } from './helpers';
import { showUndoToast } from './toasts';
import { state } from './state';
import { icon } from './icons';

export function snoozePresets(): Array<{ label: string; untilMs: () => number }> {
  const now = new Date();

  const plus3h = () => Date.now() + 3 * 60 * 60 * 1000;

  const nextDay9am = () => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0, 0);
    return d.getTime();
  };

  const nextSat9am = () => {
    const d = new Date(now);
    const daysUntilSat = (6 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntilSat);
    d.setHours(9, 0, 0, 0);
    return d.getTime();
  };

  const nextMon9am = () => {
    const d = new Date(now);
    const daysUntilMon = (1 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntilMon);
    d.setHours(9, 0, 0, 0);
    return d.getTime();
  };

  return [
    { label: 'In 3 hours', untilMs: plus3h },
    { label: 'Tomorrow 9am', untilMs: nextDay9am },
    { label: 'Saturday 9am', untilMs: nextSat9am },
    { label: 'Monday 9am', untilMs: nextMon9am },
  ];
}

export function openSnoozePicker(t: Thread, row: HTMLElement) {
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
      <span>Snooze until…</span>
      <button class="btn-icon snooze-picker-close" title="Close" aria-label="Close">${icon.close('16px')}</button>
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

  const rowRect = row.getBoundingClientRect();
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

  confirmBtn.addEventListener('click', async () => {
    const input = document.getElementById('snooze-dt') as HTMLInputElement;
    const errorEl = document.getElementById('snooze-dt-error')!;

    if (selectedPresetMs !== null) {
      await doSnooze(t, row, selectedPresetMs);
      picker.remove();
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
    await doSnooze(t, row, chosen);
    picker.remove();
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

export async function doSnooze(t: Thread, row: HTMLElement, untilMs: number, renderInbox?: () => void) {
  await snoozeThread(t, untilMs);
  t.snoozedUntil = untilMs;
  row.classList.add('snoozing-out');
  setTimeout(() => {
    row.remove();
    state.threads = state.threads.filter(x => x.id !== t.id);
  }, 250);
  const acct = state.account;
  showUndoToast(`Snoozed until ${formatDate(untilMs)}`, async () => {
    await unsnoozeThread(t);
    t.snoozedUntil = null;
    if (acct) {
      state.threads = await loadThreads(acct.id);
      renderInbox?.();
    }
  });
}

export function setupSnoozeResurface(renderInbox: () => void) {
  setInterval(async () => {
    if (!state.account) return;
    const fresh = await loadThreads(state.account.id, state.searchQuery || undefined);
    if (fresh.length !== state.threads.length) {
      state.threads = fresh;
      renderInbox();
    }
  }, 60_000);

  const isTauri = '__TAURI_INTERNALS__' in window;
  if (isTauri) {
    getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused && state.account) {
        loadThreads(state.account.id, state.searchQuery || undefined).then(fresh => {
          state.threads = fresh;
          renderInbox();
        }).catch(() => {});
      }
    });
  }
}
