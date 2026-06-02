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

// Lightweight MD5 for Gravatar URLs (not security-sensitive).
export function md5(str: string): string {
  const add32 = (a: number, b: number) => (a + b) & 0xffffffff;
  const cmn = (q: number, a: number, b: number, x: number, s: number, t: number) => {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  };
  const ff = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) => cmn((b & c) | (~b & d), a, b, x, s, t);
  const gg = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) => cmn((b & d) | (c & ~d), a, b, x, s, t);
  const hh = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) => cmn(b ^ c ^ d, a, b, x, s, t);
  const ii = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) => cmn(c ^ (b | ~d), a, b, x, s, t);
  const utf8 = unescape(encodeURIComponent(str));
  const bytes = Array.from(utf8, c => c.charCodeAt(0));
  const len = bytes.length;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const bitLen = len * 8;
  bytes.push(bitLen & 0xff, (bitLen >> 8) & 0xff, (bitLen >> 16) & 0xff, (bitLen >> 24) & 0xff, 0, 0, 0, 0);
  let [a, b, c, d] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let i = 0; i < bytes.length; i += 64) {
    const M: number[] = [];
    for (let j = 0; j < 16; j++) M[j] = bytes[i+j*4] | (bytes[i+j*4+1] << 8) | (bytes[i+j*4+2] << 16) | (bytes[i+j*4+3] << 24);
    let [aa, bb, cc, dd] = [a, b, c, d];
    [a,b,c,d] = [ff(a,b,c,d,M[0],7,-680876936),ff(d,a,b,c,M[1],12,-389564586),ff(c,d,a,b,M[2],17,606105819),ff(b,c,d,a,M[3],22,-1044525330),ff(a,b,c,d,M[4],7,-176418897),ff(d,a,b,c,M[5],12,1200080426),ff(c,d,a,b,M[6],17,-1473231341),ff(b,c,d,a,M[7],22,-45705983),ff(a,b,c,d,M[8],7,1770035416),ff(d,a,b,c,M[9],12,-1958414417),ff(c,d,a,b,M[10],17,-42063),ff(b,c,d,a,M[11],22,-1990404162),ff(a,b,c,d,M[12],7,1804603682),ff(d,a,b,c,M[13],12,-40341101),ff(c,d,a,b,M[14],17,-1502002290),ff(b,c,d,a,M[15],22,1236535329)];
    [a,b,c,d] = [gg(a,b,c,d,M[1],5,-165796510),gg(d,a,b,c,M[6],9,-1069501632),gg(c,d,a,b,M[11],14,643717713),gg(b,c,d,a,M[0],20,-373897302),gg(a,b,c,d,M[5],5,-701558691),gg(d,a,b,c,M[10],9,38016083),gg(c,d,a,b,M[15],14,-660478335),gg(b,c,d,a,M[4],20,-405537848),gg(a,b,c,d,M[9],5,568446438),gg(d,a,b,c,M[14],9,-1019803690),gg(c,d,a,b,M[3],14,-187363961),gg(b,c,d,a,M[8],20,1163531501),gg(a,b,c,d,M[13],5,-1444681467),gg(d,a,b,c,M[2],9,-51403784),gg(c,d,a,b,M[7],14,1735328473),gg(b,c,d,a,M[12],20,-1926607734)];
    [a,b,c,d] = [hh(a,b,c,d,M[5],4,-378558),hh(d,a,b,c,M[8],11,-2022574463),hh(c,d,a,b,M[11],16,1839030562),hh(b,c,d,a,M[14],23,-35309556),hh(a,b,c,d,M[1],4,-1530992060),hh(d,a,b,c,M[4],11,1272893353),hh(c,d,a,b,M[7],16,-155497632),hh(b,c,d,a,M[10],23,-1094730640),hh(a,b,c,d,M[13],4,681279174),hh(d,a,b,c,M[0],11,-358537222),hh(c,d,a,b,M[3],16,-722521979),hh(b,c,d,a,M[6],23,76029189),hh(a,b,c,d,M[9],4,-640364487),hh(d,a,b,c,M[12],11,-421815835),hh(c,d,a,b,M[15],16,530742520),hh(b,c,d,a,M[2],23,-995338651)];
    [a,b,c,d] = [ii(a,b,c,d,M[0],6,-198630844),ii(d,a,b,c,M[7],10,1126891415),ii(c,d,a,b,M[14],15,-1416354905),ii(b,c,d,a,M[5],21,-57434055),ii(a,b,c,d,M[12],6,1700485571),ii(d,a,b,c,M[3],10,-1894986606),ii(c,d,a,b,M[10],15,-1051523),ii(b,c,d,a,M[1],21,-2054922799),ii(a,b,c,d,M[8],6,1873313359),ii(d,a,b,c,M[15],10,-30611744),ii(c,d,a,b,M[6],15,-1560198380),ii(b,c,d,a,M[13],21,1309151649),ii(a,b,c,d,M[4],6,-145523070),ii(d,a,b,c,M[11],10,-1120210379),ii(c,d,a,b,M[2],15,718787259),ii(b,c,d,a,M[9],21,-343485551)];
    [a, b, c, d] = [add32(a, aa), add32(b, bb), add32(c, cc), add32(d, dd)];
  }
  return [a, b, c, d].map(n => (n >>> 0).toString(16).padStart(8, '0').replace(/(..)/g, (_, x) => x[1] + x[0]).replace(/(....)/g, (_, x) => x[2] + x[3] + x[0] + x[1])).join('');
}

export function gravatarUrl(email: string): string {
  const hash = md5(email.trim().toLowerCase());
  return `https://www.gravatar.com/avatar/${hash}?s=64&d=404`;
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
    const offset = i * 12; // px overlap shift
    return `<div class="avatar stacked-avatar" style="background:${color};left:${offset}px;z-index:${maxCount - i}" data-initial="${initial}">${faviconImg}${gravatarImg}</div>`;
  });
  const totalWidth = 32 + (unique.length - 1) * 12;
  return `<div class="stacked-avatars" style="width:${totalWidth}px">${avatars.join('')}</div>`;
}

export function avatarColor(s: string): string {
  const colors = ['#7c6fd4','#4a90d9','#e67e22','#27ae60','#c0392b','#8e44ad','#16a085','#d35400'];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return colors[Math.abs(h) % colors.length];
}
