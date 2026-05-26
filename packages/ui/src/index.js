export const brandTokens = {
  color: { paper: '#f8f1e5', ink: '#1e211b', accent: '#6d7b35', brass: '#a97832' },
  radius: { card: '24px', control: '14px' },
};

export function renderPipMark() {
  return `<svg class="pip" viewBox="0 0 64 64" role="img" aria-label="Pip the Keeper Owl"><circle cx="32" cy="32" r="29" fill="#fffaf1" stroke="#6d7b35" stroke-width="4"/><path d="M18 25c5-9 23-9 28 0v16c0 8-6 14-14 14s-14-6-14-14V25Z" fill="#6d7b35"/><circle cx="26" cy="33" r="5" fill="#fffaf1"/><circle cx="38" cy="33" r="5" fill="#fffaf1"/><path d="M32 38l5 5H27l5-5Z" fill="#a97832"/></svg>`;
}
