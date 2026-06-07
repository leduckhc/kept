/**
 * Sidebar.tsx — Navigation sidebar with views list and account avatar.
 */
import { For } from 'solid-js';
import { appState, switchView, openSettings, closeNavDrawer } from './store';
import type { ViewName } from './store';
import { icon } from '../icons';

const VIEWS: Array<{ name: ViewName; icon: string }> = [
  { name: 'Inbox',     icon: icon.email('18px') },
  { name: 'Triage',    icon: icon.zap('18px') },
  { name: 'Snoozed',   icon: icon.clock('18px') },
  { name: 'SetAside',  icon: icon.bookmark('18px') },
  { name: 'Sent',      icon: icon.send('18px') },
  { name: 'Drafts',    icon: icon.pencil('18px') },
  { name: 'Starred',   icon: icon.star('18px') },
  { name: 'Scheduled', icon: icon.calendar('18px') },
  { name: 'Reminders', icon: icon.bell('18px') },
  { name: 'Trash',     icon: icon.trash('18px') },
  { name: 'Archive',   icon: icon.archive('18px') },
];

function getAccountInitial(): string {
  if (!appState.account?.email) return '?';
  return appState.account.email.charAt(0).toUpperCase();
}

export function Sidebar() {
  const onViewClick = (view: ViewName) => {
    switchView(view);
    closeNavDrawer();
  };

  return (
    <nav class="sidebar" id="sidebar">
      <For each={VIEWS}>
        {(v) => (
          <button
            class={`sidebar-btn${v.name === appState.currentView ? ' active' : ''}`}
            data-view={v.name}
            title={v.name}
            onClick={() => onViewClick(v.name)}
            innerHTML={v.icon}
          />
        )}
      </For>
      <div class="sidebar-smart-folders" id="sidebar-smart-folders"></div>
      <button class="sidebar-btn sidebar-add-folder" id="btn-add-smart-folder" title="New Smart Folder" innerHTML={icon.plus('18px')} />
      <div class="sidebar-spacer"></div>
      <button
        class="sidebar-btn sidebar-settings"
        title="Settings"
        onClick={() => openSettings()}
        innerHTML={icon.settings('18px')}
      />
      <button class="sidebar-btn sidebar-avatar" id="btn-account" title="Account">
        <span class="avatar-circle">{getAccountInitial()}</span>
      </button>
    </nav>
  );
}

/** Mobile nav drawer */
export function NavDrawer() {
  const onViewClick = (view: ViewName) => {
    switchView(view);
    closeNavDrawer();
  };

  return (
    <>
      <div
        class={`nav-drawer-backdrop${appState.navDrawerOpen ? ' open' : ''}`}
        id="nav-drawer-backdrop"
        onClick={closeNavDrawer}
      />
      <nav class={`nav-drawer${appState.navDrawerOpen ? ' open' : ''}`} id="nav-drawer">
        <div class="nav-drawer-header">Kept</div>
        <For each={VIEWS}>
          {(v) => (
            <button
              class={`nav-drawer-item${v.name === appState.currentView ? ' active' : ''}`}
              data-view={v.name}
              onClick={() => onViewClick(v.name)}
            >
              <span innerHTML={v.icon} />
              <span>{v.name}</span>
            </button>
          )}
        </For>
      </nav>
    </>
  );
}
