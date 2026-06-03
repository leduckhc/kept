import type { Thread } from './gmail';

export const AVATAR_COLORS = [
  '#d97706', '#7c3aed', '#0891b2', '#16a34a',
  '#dc2626', '#db2777', '#2563eb', '#65a30d',
];

export const ACCOUNT_BADGE_COLORS = ['#7c6fa8', '#5b8dd9', '#7cb9a8', '#d97c5b', '#c47cad'];

export function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// SHA-256 for Gravatar URLs (sync, pure JS — not security-sensitive).
export function sha256Sync(str: string): string {
  const utf8 = new TextEncoder().encode(str);
  // SHA-256 constants
  const K: number[] = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));
  // Pre-processing: pad message
  const len = utf8.length;
  const bitLen = len * 8;
  const padded = new Uint8Array(((len + 9 + 63) & ~63));
  padded.set(utf8);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLen, false);
  // Initialize hash
  let [h0,h1,h2,h3,h4,h5,h6,h7] = [
    0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19
  ];
  // Process blocks
  for (let i = 0; i < padded.length; i += 64) {
    const w = new Int32Array(64);
    for (let j = 0; j < 16; j++) w[j] = view.getInt32(i + j * 4, false);
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(7, w[j-15]>>>0) ^ rotr(18, w[j-15]>>>0) ^ (w[j-15] >>> 3);
      const s1 = rotr(17, w[j-2]>>>0) ^ rotr(19, w[j-2]>>>0) ^ (w[j-2] >>> 10);
      w[j] = (w[j-16] + s0 + w[j-7] + s1) | 0;
    }
    let [a,b,c,d,e,f,g,h] = [h0,h1,h2,h3,h4,h5,h6,h7];
    for (let j = 0; j < 64; j++) {
      const S1 = rotr(6, e>>>0) ^ rotr(11, e>>>0) ^ rotr(25, e>>>0);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[j] + w[j]) | 0;
      const S0 = rotr(2, a>>>0) ^ rotr(13, a>>>0) ^ rotr(22, a>>>0);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    h0 = (h0+a)|0; h1 = (h1+b)|0; h2 = (h2+c)|0; h3 = (h3+d)|0;
    h4 = (h4+e)|0; h5 = (h5+f)|0; h6 = (h6+g)|0; h7 = (h7+h)|0;
  }
  return [h0,h1,h2,h3,h4,h5,h6,h7].map(n => (n >>> 0).toString(16).padStart(8, '0')).join('');
}

export function gravatarUrl(email: string): string {
  const hash = sha256Sync(email.trim().toLowerCase());
  return `https://gravatar.com/avatar/${hash}?s=64&d=404`;
}

export function avatarHtml(t: Thread): string {
  const label = t.senderName || t.senderEmail;
  const initial = label[0].toUpperCase();
  const color = AVATAR_COLORS[hashStr(t.senderEmail) % AVATAR_COLORS.length];
  const domain = t.senderEmail.split('@')[1] ?? '';
  const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : '';
  const gravatar = t.senderEmail ? gravatarUrl(t.senderEmail) : '';
  const faviconImg = faviconUrl ? `<img class="avatar-favicon" src="${faviconUrl}" alt="" loading="lazy" onerror="this.style.display='none'">` : '';
  const gravatarImg = gravatar ? `<img class="avatar-gravatar" src="${gravatar}" alt="" loading="lazy" onerror="this.style.display='none'">` : '';
  return `<div class="avatar" style="background:${color}" data-initial="${initial}">${faviconImg}${gravatarImg}</div>`;
}

/** Stacked overlapping avatars for group rows (up to K senders). */
export function stackedAvatarsHtml(threads: Thread[], maxCount = 3): string {
  // Dedupe by senderEmail, keep order of first appearance
  const seen = new Set<string>();
  const unique: Thread[] = [];
  for (const t of threads) {
    if (!seen.has(t.senderEmail)) {
      seen.add(t.senderEmail);
      unique.push(t);
      if (unique.length >= maxCount) break;
    }
  }
  const avatars = unique.map((t, i) => {
    const label = t.senderName || t.senderEmail;
    const initial = label[0].toUpperCase();
    const color = AVATAR_COLORS[hashStr(t.senderEmail) % AVATAR_COLORS.length];
    const domain = t.senderEmail.split('@')[1] ?? '';
    const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : '';
    const gravatar = t.senderEmail ? gravatarUrl(t.senderEmail) : '';
    const faviconImg = faviconUrl ? `<img class="avatar-favicon" src="${faviconUrl}" alt="" loading="lazy" onerror="this.style.display='none'">` : '';
    const gravatarImg = gravatar ? `<img class="avatar-gravatar" src="${gravatar}" alt="" loading="lazy" onerror="this.style.display='none'">` : '';
    const offset = i * 8; // px overlap shift — tight stacking
    return `<div class="avatar stacked-avatar" style="background:${color};left:${offset}px;z-index:${maxCount - i}" data-initial="${initial}">${faviconImg}${gravatarImg}</div>`;
  });
  const totalWidth = 32 + (unique.length - 1) * 8;
  return `<div class="stacked-avatars" style="width:${totalWidth}px">${avatars.join('')}</div>`;
}

export function avatarColor(s: string): string {
  const colors = ['#7c6fd4','#4a90d9','#e67e22','#27ae60','#c0392b','#8e44ad','#16a085','#d35400'];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return colors[Math.abs(h) % colors.length];
}
