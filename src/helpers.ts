import { state, type LayoutMode } from './state';

export function applyTheme(theme: string) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
  localStorage.setItem('theme', theme);
}

export function applyLayoutMode(mode: LayoutMode) {
  state.layoutMode = mode;
  localStorage.setItem('kept.layoutMode', mode);
  const shell = document.getElementById('app-shell');
  if (shell) {
    shell.classList.toggle('layout-2pane', mode === '2-pane');
  }
}

export function toggleLayoutMode() {
  const next: LayoutMode = state.layoutMode === '3-pane' ? '2-pane' : '3-pane';
  applyLayoutMode(next);
  // If switching to 2-pane while reader is open, keep it; if to 3-pane, keep it too
}

export function setStatus(msg: string) {
  const el = document.getElementById('status-right');
  if (el) el.textContent = msg;
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function formatDate(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (d >= today) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d >= yesterday) return 'Yesterday';
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Convert Date to "YYYY-MM-DDTHH:MM" string for datetime-local input */
export function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
