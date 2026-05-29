// ui/src/index.ts — typed brand tokens and Pip SVG mark

export interface BrandTokens {
  color: { paper: string; ink: string; accent: string; brass: string };
  radius: { card: string; control: string };
}

export const brandTokens: BrandTokens = {
  color: { paper: '#fbfaff', ink: '#1f1b2d', accent: '#7c5cff', brass: '#a78bfa' },
  radius: { card: '24px', control: '14px' },
};

export function renderPipMark(): string {
  return `<svg class="pip" viewBox="0 0 64 64" role="img" aria-label="Pip the Keeper Owl"><circle cx="32" cy="32" r="29" fill="#ffffff" stroke="#7c5cff" stroke-width="4"/><path d="M18 25c5-9 23-9 28 0v16c0 8-6 14-14 14s-14-6-14-14V25Z" fill="#7c5cff"/><circle cx="26" cy="33" r="5" fill="#ffffff"/><circle cx="38" cy="33" r="5" fill="#ffffff"/><path d="M32 38l5 5H27l5-5Z" fill="#c4b5fd"/></svg>`;
}
