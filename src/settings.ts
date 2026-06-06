// settings.ts — Settings panel logic extracted from main.ts
import { removeAccount, saveAccount, startOAuth } from './auth';
import { clearActiveAccountId } from './accountContext';
import { applyTheme, toggleLayoutMode, setStatus, flashStatus, esc } from './helpers';
import { state, setAccount } from './state';
import { type Thread, loadThreads } from './store';
import { ACCOUNT_BADGE_COLORS } from './avatar';

export interface SettingsDeps {
  renderInbox: () => void;
  refreshAll: () => Promise<void>;
  showAuth: () => void;
  loadUnifiedThreads: () => Promise<Thread[]>;
}

let _deps: SettingsDeps | null = null;

export function initSettings(deps: SettingsDeps) {
  _deps = deps;
}

export function openSettings() {
  const shell = document.getElementById('app-shell');
  const panel = document.getElementById('settings-panel');
  if (!shell || !panel) return;

  // Render state.accounts list
  renderSettingsAccounts();

  // Sync dark mode toggle state
  const currentTheme = localStorage.getItem('theme') ?? 'light';
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const toggle = document.getElementById('settings-darkmode-toggle') as HTMLButtonElement;
  const sub = document.getElementById('settings-darkmode-sub');
  if (toggle) {
    toggle.setAttribute('aria-checked', String(isDark));
    toggle.classList.toggle('on', isDark);
  }
  const themeLabel = currentTheme === 'system' ? 'Following system preference' : isDark ? 'Currently using dark theme' : 'Switch to dark theme';
  if (sub) sub.textContent = themeLabel;

  // Sync smart notifications toggle state
  const smartNotifToggle = document.getElementById('settings-smartnotif-toggle') as HTMLButtonElement;
  const smartNotifSub = document.getElementById('settings-smartnotif-sub');
  const smartOn = localStorage.getItem('smartNotifications') !== 'false';
  if (smartNotifToggle) {
    smartNotifToggle.setAttribute('aria-checked', String(smartOn));
    smartNotifToggle.classList.toggle('on', smartOn);
  }
  if (smartNotifSub) smartNotifSub.textContent = smartOn ? 'Only notify for known senders' : 'Notify for all new threads';

  // Wire back button
  document.getElementById('settings-back')!.addEventListener('click', closeSettings, { once: true });

  // Wire smart notifications toggle
  smartNotifToggle?.addEventListener('click', () => {
    const nowOn = localStorage.getItem('smartNotifications') !== 'false';
    const next = !nowOn;
    localStorage.setItem('smartNotifications', String(next));
    smartNotifToggle.setAttribute('aria-checked', String(next));
    smartNotifToggle.classList.toggle('on', next);
    const subEl = document.getElementById('settings-smartnotif-sub');
    if (subEl) subEl.textContent = next ? 'Only notify for known senders' : 'Notify for all new threads';
  }, { once: true });

  // Wire dark mode toggle (once: true prevents listener accumulation on repeated open/close)
  toggle?.addEventListener('click', () => {
    const cur = localStorage.getItem('theme') ?? 'light';
    const next = cur === 'light' ? 'dark' : cur === 'dark' ? 'system' : 'light';
    applyTheme(next);
    const nowDark = document.documentElement.getAttribute('data-theme') === 'dark';
    toggle.setAttribute('aria-checked', String(nowDark));
    toggle.classList.toggle('on', nowDark);
    const subEl = document.getElementById('settings-darkmode-sub');
    const label = next === 'system' ? 'Following system preference' : nowDark ? 'Currently using dark theme' : 'Switch to dark theme';
    if (subEl) subEl.textContent = label;
  }, { once: true });

  // Sync layout toggle state
  const layoutToggle = document.getElementById('settings-layout-toggle') as HTMLButtonElement;
  const layoutSub = document.getElementById('settings-layout-sub');
  const is2Pane = state.layoutMode === '2-pane';
  if (layoutToggle) {
    layoutToggle.setAttribute('aria-checked', String(is2Pane));
    layoutToggle.classList.toggle('on', is2Pane);
  }
  if (layoutSub) layoutSub.textContent = is2Pane ? 'Showing list only, click to read' : 'Hide email preview pane';

  // Wire layout toggle
  layoutToggle?.addEventListener('click', () => {
    toggleLayoutMode();
    const nowIs2 = state.layoutMode === '2-pane';
    layoutToggle.setAttribute('aria-checked', String(nowIs2));
    layoutToggle.classList.toggle('on', nowIs2);
    const subEl = document.getElementById('settings-layout-sub');
    if (subEl) subEl.textContent = nowIs2 ? 'Showing list only, click to read' : 'Hide email preview pane';
  }, { once: true });



  // Load and wire signature editor
  const sigTa = document.getElementById('settings-signature-ta') as HTMLTextAreaElement;
  const sigPreview = document.getElementById('settings-signature-preview') as HTMLElement;
  const sigSaveBtn = document.getElementById('settings-signature-save') as HTMLButtonElement;
  if (sigTa && state.account) {
    sigTa.value = state.account.signature ?? '';
    if (sigTa.value) {
      sigPreview.textContent = sigTa.value;
      sigPreview.style.display = 'block';
    }
    sigTa.addEventListener('input', () => {
      if (sigTa.value.trim()) {
        sigPreview.textContent = sigTa.value;
        sigPreview.style.display = 'block';
      } else {
        sigPreview.style.display = 'none';
      }
    });
    sigSaveBtn.addEventListener('click', async () => {
      if (!state.account) return;
      const updated = { ...state.account, signature: sigTa.value };
      await saveAccount(updated);
      state.account = updated;
      const idx = state.accounts.findIndex(a => a.id === updated.id);
      if (idx >= 0) state.accounts[idx] = updated;
      sigSaveBtn.textContent = 'Saved';
      setTimeout(() => { sigSaveBtn.textContent = 'Save'; }, 1500);
    });
  }

  // Wire add account (once: true prevents duplicate OAuth launches on repeated open/close)
  document.getElementById('settings-add-account')!.addEventListener('click', async () => {
    try {
      const newAcct = await startOAuth();
      const existing = state.accounts.find(a => a.id === newAcct.id);
      if (existing) {
        const idx = state.accounts.indexOf(existing);
        state.accounts[idx] = newAcct;
        setStatus(`${newAcct.email} token refreshed`);
      } else {
        state.accounts.push(newAcct);
        setStatus(`${newAcct.email} added`);
      }
      renderSettingsAccounts();
    } catch (e) {
      flashStatus(`Add account failed: ${e}`);
    }
  });

  // Wire sign out all button
  document.getElementById('settings-signout-all')!.addEventListener('click', async () => {
    try {
      for (const a of [...state.accounts]) {
        await removeAccount(a).catch((e) => console.warn('removeAccount failed for', a.email, e));
      }
      state.accounts = [];
      state.account = null;
      state.threads = [];
      state.syncing = false;
      clearActiveAccountId();
      localStorage.removeItem('kept-followup-reminders');
      closeSettings();
      _deps?.showAuth();
    } catch (err) {
      console.error('Sign out all error:', err);
      // Force show auth even if cleanup had errors
      state.accounts = [];
      state.account = null;
      state.threads = [];
      clearActiveAccountId();
      closeSettings();
      _deps?.showAuth();
    }
  }, { once: true });

  // Animate in
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  shell.classList.add('settings-open');
}

export function closeSettings() {
  const shell = document.getElementById('app-shell');
  const panel = document.getElementById('settings-panel');
  if (!shell || !panel) return;
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  shell.classList.remove('settings-open');
}

function renderSettingsAccounts() {
  const list = document.getElementById('settings-accounts-list');
  if (!list) return;
  list.innerHTML = state.accounts.map((a) => {
    const initial = (a.email[0] ?? '?').toUpperCase();
    const color = ACCOUNT_BADGE_COLORS[(a.colorIndex ?? 0) % ACCOUNT_BADGE_COLORS.length];
    return `
      <div class="settings-account-row" data-id="${esc(a.id)}">
        <div class="settings-avatar" style="background:${color}">${initial}</div>
        <div class="settings-account-info">
          <div class="settings-account-name">${esc(a.email.split('@')[0])}</div>
          <div class="settings-account-email">${esc(a.email)}</div>
        </div>
        <button class="settings-account-remove" data-id="${esc(a.id)}" title="Remove account"
          aria-label="Remove ${esc(a.email)}">×</button>
      </div>`;
  }).join('');

  // Wire remove buttons
  list.querySelectorAll<HTMLButtonElement>('.settings-account-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const removeId = btn.dataset.id!;
      const target = state.accounts.find(a => a.id === removeId);
      if (!target) return;
      try {
        await removeAccount(target);
        state.accounts = state.accounts.filter(a => a.id !== removeId);
        if (state.account?.id === removeId) {
          const next = state.accounts[0] ?? null;
          if (next) {
            setAccount(next);
            state.threads = await loadThreads(next.id);
            closeSettings();
            _deps?.renderInbox();
            await _deps?.refreshAll();
          } else {
            clearActiveAccountId();
            state.account = null;
            state.threads = [];
            state.syncing = false;
            _deps?.showAuth();
          }
        } else {
          renderSettingsAccounts();
        }
      } catch (err) {
        console.error('Remove account error:', err);
        setStatus('Failed to remove account');
      }
    });
  });
}
