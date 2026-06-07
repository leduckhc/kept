/**
 * Settings.tsx — Settings slide-in panel.
 * Accounts, dark mode, notifications, snippets, auto-labels, signature.
 */
import { Show, For, createSignal, onMount } from 'solid-js';
import { appState, setAppState, closeSettings } from './store';
import { removeAccount, startOAuth, getAllAccounts, saveAccount } from '../auth';
import { clearActiveAccountId, setActiveAccountId } from '../accountContext';
import { applyTheme } from '../helpers';
import { ACCOUNT_BADGE_COLORS } from '../avatar';
import { icon } from '../icons';
import { refreshAll } from './sync';

export function Settings() {
  const [signature, setSignature] = createSignal('');

  onMount(() => {
    // Load current signature
    if (appState.account?.signature) {
      setSignature(appState.account.signature);
    }
  });

  const isDark = () => appState.darkMode;
  const smartNotif = () => appState.smartNotifications;

  const toggleDarkMode = () => {
    const next = !isDark();
    setAppState('darkMode', next);
    const theme = next ? 'dark' : 'light';
    applyTheme(theme);
  };

  const toggleSmartNotifications = () => {
    const next = !smartNotif();
    setAppState('smartNotifications', next);
    localStorage.setItem('smartNotifications', String(next));
  };

  const handleAddAccount = async () => {
    try {
      await startOAuth();
      const accounts = await getAllAccounts();
      setAppState('accounts', accounts);
    } catch (e) {
      console.error('Add account failed:', e);
    }
  };

  const handleRemoveAccount = async (accountId: string) => {
    const acct = appState.accounts.find(a => a.id === accountId);
    if (!acct) return;
    if (!confirm(`Remove account ${acct.email}?`)) return;
    await removeAccount(acct);
    const accounts = await getAllAccounts();
    setAppState('accounts', accounts);
    if (appState.account?.id === accountId) {
      if (accounts.length > 0) {
        setAppState('account', accounts[0]);
        setActiveAccountId(accounts[0].id);
        await refreshAll();
      } else {
        setAppState('account', null);
        setAppState('authenticated', false);
        clearActiveAccountId();
      }
    }
  };

  const handleSaveSignature = async () => {
    if (!appState.account) return;
    const updated = { ...appState.account, signature: signature() };
    await saveAccount(updated);
    setAppState('account', updated);
  };

  return (
    <Show when={appState.settingsOpen}>
      <div class="settings-panel open" id="settings-panel">
        <div class="settings-topbar">
          <button class="settings-back" onClick={closeSettings}>← Inbox</button>
          <span class="settings-title">Settings</span>
        </div>
        <div class="settings-body">
          {/* Accounts */}
          <div class="settings-section">
            <div class="settings-section-label">Accounts</div>
            <For each={appState.accounts}>
              {(acct, i) => (
                <div class="settings-account-row">
                  <span class="settings-account-badge" style={{ background: ACCOUNT_BADGE_COLORS[i() % ACCOUNT_BADGE_COLORS.length] }}>
                    {acct.email.charAt(0).toUpperCase()}
                  </span>
                  <span class="settings-account-email">{acct.email}</span>
                  <button class="settings-account-remove" onClick={() => handleRemoveAccount(acct.id)} title="Remove">
                    <span innerHTML={icon.close('14px')} />
                  </button>
                </div>
              )}
            </For>
            <button class="settings-action-btn" onClick={handleAddAccount}>
              + Add account
            </button>
          </div>

          {/* Appearance */}
          <div class="settings-section">
            <div class="settings-section-label">Appearance</div>
            <div class="settings-row">
              <div class="settings-row-text">
                <div class="settings-row-label">Dark mode</div>
                <div class="settings-row-sub">
                  {isDark() ? 'Currently using dark theme' : 'Switch to dark theme'}
                </div>
              </div>
              <button
                class={`settings-toggle${isDark() ? ' on' : ''}`}
                role="switch"
                aria-checked={isDark() ? 'true' : 'false' as 'true' | 'false'}
                onClick={toggleDarkMode}
              >
                <span class="settings-toggle-thumb"></span>
              </button>
            </div>
          </div>

          {/* Notifications */}
          <div class="settings-section">
            <div class="settings-section-label">Notifications</div>
            <div class="settings-row">
              <div class="settings-row-text">
                <div class="settings-row-label">Smart Notifications</div>
                <div class="settings-row-sub">
                  {smartNotif() ? 'Only notify for known senders' : 'Notify for all new threads'}
                </div>
              </div>
              <button
                class={`settings-toggle${smartNotif() ? ' on' : ''}`}
                role="switch"
                aria-checked={smartNotif() ? 'true' : 'false' as 'true' | 'false'}
                onClick={toggleSmartNotifications}
              >
                <span class="settings-toggle-thumb"></span>
              </button>
            </div>
          </div>

          {/* Signature */}
          <div class="settings-section">
            <div class="settings-section-label">Email Signature</div>
            <textarea
              class="settings-signature-ta"
              placeholder="Your signature…"
              rows={4}
              value={signature()}
              onInput={(e) => setSignature(e.currentTarget.value)}
            />
            <div class="settings-signature-actions">
              <button class="settings-signature-save" onClick={handleSaveSignature}>Save</button>
            </div>
          </div>

          <div class="settings-footer"></div>
        </div>
      </div>
    </Show>
  );
}
