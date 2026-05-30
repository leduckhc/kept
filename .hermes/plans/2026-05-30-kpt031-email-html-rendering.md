# KPT-031: Proper HTML Email Rendering

## Problem

Emails do not render correctly in the thread reader. Two root causes:

1. **`gmail.ts` strips HTML to plain text** — `extractTextBody()` calls `htmlToText()` which DOMParser-strips all formatting. Rich emails (tables, links, bold, images, newsletters) become a wall of unformatted text.
2. **`main.ts` reader uses `textContent`** — even if HTML was preserved, `bodyDiv.textContent = m.body` would escape all tags as literal text.

Result: every email looks broken. Links are gone, formatting lost, newsletters unreadable.

## Goal

Render HTML emails with full formatting in the thread reader, safely sanitized, with remote image blocking preserved (existing CSP + image proxy pattern from KPT-013).

## Security Requirements (CSO-level)

Email HTML is the #1 XSS vector. Defense-in-depth:

1. **DOMPurify ≥3.3.2** (latest, patches CVE-2024-47875, CVE-2024-45801, CVE-2025-15599, CVE-2026-0540)
   - Strip `<script>`, `<style>`, event handlers, data URIs (except safe images), form elements
   - Whitelist: safe HTML subset (p, div, span, a, img, table, tr, td, th, ul, ol, li, br, hr, h1-h6, strong, em, b, i, blockquote, pre, code)
   - `ALLOW_DATA_ATTR: false`, `FORBID_TAGS: ['style', 'script', 'form', 'input', 'textarea', 'select', 'button', 'object', 'embed', 'iframe']`
   - `FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style']` — strip inline styles to prevent CSS-based attacks
   
2. **Sandboxed iframe** — render sanitized HTML inside `<iframe sandbox="allow-popups-to-escape-sandbox" srcdoc="...">` 
   - No `allow-scripts`, no `allow-same-origin` → even if sanitizer is bypassed, script execution is blocked
   - `allow-popups-to-escape-sandbox` so links open in system browser via Tauri shell
   
3. **Remote image blocking preserved** — existing pattern from KPT-013 (images blocked by default, "Load images" button shows them via Tauri image proxy)
   - DOMPurify hook: rewrite all `<img src>` to `data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==` (1x1 transparent) initially
   - Store original `src` in `data-original-src`
   - "Load images" button restores originals (routed through existing Tauri image proxy to prevent IP leak)

4. **No new CVE surface** — DOMPurify is the only new dependency. Zero transitive deps. 13KB gzipped.

## Approach

### Package choice: DOMPurify 3.3.2+

| Option | Pros | Cons |
|--------|------|------|
| **DOMPurify** | Gold standard, DOM-based (no regex), 0 transitive deps, actively maintained by Cure53 | Had CVEs (all patched ≥3.3.2) |
| sanitize-html | Server-side focused, regex-based | Slower, more deps, not designed for browser |
| Rehype/unified | Ecosystem approach | Heavy dep tree, overkill for display-only |
| Shadow DOM only | No deps | No actual sanitization, just isolation |

**Decision: DOMPurify 3.3.2+** — only real option for client-side email HTML. Pin exact version. Zero transitive deps = minimal attack surface.

### Architecture change

```
BEFORE:
Gmail API → extractTextBody() → htmlToText() → plain string → textContent

AFTER:
Gmail API → extractHtmlBody() → raw HTML string → DOMPurify.sanitize() → iframe srcdoc
          ↘ extractTextBody() → plain text fallback (for snippet/search)
```

## Step-by-step plan

### Step 1: Install DOMPurify
```bash
cd /home/le/kept && pnpm add dompurify@^3.3.2
```
Add `@types/dompurify` as devDependency:
```bash
pnpm add -D @types/dompurify
```

### Step 2: Modify `src/gmail.ts` — add `extractHtmlBody()`

Keep existing `extractTextBody()` unchanged (used for snippets, FTS5 indexing, search).

Add new function:
```typescript
export function extractHtmlBody(payload: MimePart, depth = 0): string | null {
  if (depth > 8) return null;
  
  // Leaf node with HTML body
  if (payload.body?.data && payload.mimeType === 'text/html') {
    return decodeBase64(payload.body.data);
  }
  
  const parts = payload.parts ?? [];
  
  // multipart/alternative: prefer text/html
  if (payload.mimeType === 'multipart/alternative') {
    const html = parts.find(p => p.mimeType === 'text/html');
    if (html?.body?.data) return decodeBase64(html.body.data);
    // Recurse
    for (const p of parts) {
      const result = extractHtmlBody(p, depth + 1);
      if (result) return result;
    }
    return null;
  }
  
  // multipart/mixed, multipart/related: recurse
  for (const p of parts) {
    const result = extractHtmlBody(p, depth + 1);
    if (result) return result;
  }
  
  return null;
}
```

Modify `fetchMessageBody()` return type to include `htmlBody`:
```typescript
messages: Array<{ from: string; body: string; htmlBody: string | null; receivedAt: number; gmailMessageId: string }>
```

### Step 3: Create `src/sanitize.ts` — sanitization + iframe rendering

```typescript
import DOMPurify from 'dompurify';

const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: ['p', 'div', 'span', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
    'ul', 'ol', 'li', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'em', 'b', 'i', 'u', 'blockquote', 'pre', 'code', 'sup', 'sub', 'dl', 'dt', 'dd'],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'width', 'height', 'colspan', 'rowspan', 'target', 'class'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['style', 'script', 'form', 'input', 'textarea', 'select', 'button', 'object', 'embed', 'iframe', 'svg', 'math'],
  ADD_ATTR: ['target'], // allow target="_blank" on links
};

// Strip remote images, store originals for lazy-load
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'IMG') {
    const src = node.getAttribute('src') || '';
    if (src && !src.startsWith('data:')) {
      node.setAttribute('data-original-src', src);
      node.setAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==');
      node.setAttribute('alt', '[Image blocked]');
    }
  }
  // Force links to open externally
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export function sanitizeEmailHtml(rawHtml: string): string {
  return DOMPurify.sanitize(rawHtml, DOMPURIFY_CONFIG);
}
```

### Step 4: Modify thread reader in `src/main.ts`

Replace `bodyDiv.textContent = m.body` with:

```typescript
import { sanitizeEmailHtml } from './sanitize';

// In the reader message loop:
if (m.htmlBody) {
  // Render sanitized HTML in sandboxed iframe
  const iframe = document.createElement('iframe');
  iframe.sandbox.add('allow-popups-to-escape-sandbox');
  iframe.style.cssText = 'width:100%; border:none; overflow:hidden;';
  iframe.srcdoc = `
    <!DOCTYPE html>
    <html><head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; color: var(--text, #222); margin: 0; padding: 0; line-height: 1.5; }
        a { color: #5B4EDB; }
        img[data-original-src] { background: #f0f0f0; min-height: 20px; border-radius: 4px; }
        blockquote { border-left: 3px solid #ddd; margin: 8px 0; padding-left: 12px; color: #666; }
        table { border-collapse: collapse; max-width: 100%; }
        td, th { padding: 4px 8px; border: 1px solid #eee; }
        pre { background: #f5f5f5; padding: 8px; border-radius: 4px; overflow-x: auto; }
      </style>
    </head><body>${sanitizeEmailHtml(m.htmlBody)}</body></html>
  `;
  // Auto-resize iframe to content height
  iframe.onload = () => {
    const h = iframe.contentDocument?.body?.scrollHeight;
    if (h) iframe.style.height = h + 'px';
  };
  msgDiv.appendChild(iframe);
} else {
  // Fallback: plain text
  const bodyDiv = document.createElement('div');
  bodyDiv.style.cssText = 'white-space:pre-wrap; font-size:14px;';
  bodyDiv.textContent = m.body.slice(0, 20000);
  msgDiv.appendChild(bodyDiv);
}
```

### Step 5: "Load Images" button (per-message)

Add a "Load images" button below each iframe that has blocked images:
```typescript
const loadImgBtn = document.createElement('button');
loadImgBtn.className = 'btn-load-images';
loadImgBtn.textContent = '🖼 Load images';
loadImgBtn.style.display = 'none'; // shown only if images were blocked
loadImgBtn.addEventListener('click', () => {
  const imgs = iframe.contentDocument?.querySelectorAll('img[data-original-src]');
  imgs?.forEach(img => {
    // Route through existing Tauri image proxy
    const originalSrc = img.getAttribute('data-original-src')!;
    img.setAttribute('src', originalSrc); // or proxy URL if proxy exists
    img.removeAttribute('data-original-src');
  });
  loadImgBtn.remove();
});
// Check if any images were blocked
iframe.onload = () => {
  const h = iframe.contentDocument?.body?.scrollHeight;
  if (h) iframe.style.height = h + 'px';
  const blocked = iframe.contentDocument?.querySelectorAll('img[data-original-src]');
  if (blocked && blocked.length > 0) loadImgBtn.style.display = 'block';
};
```

### Step 6: Tests

- Unit test `sanitizeEmailHtml()` with malicious payloads:
  - `<script>alert(1)</script>` → stripped
  - `<img onerror="alert(1)" src="x">` → event handler stripped
  - `<a href="javascript:alert(1)">` → href sanitized
  - `<div style="background:url(evil)">` → style stripped
  - Normal HTML preserved: links, tables, bold, images with data-original-src
- Unit test `extractHtmlBody()` with multipart/alternative payloads
- Integration: build passes, reader renders HTML emails

## Files to change

| File | Change |
|------|--------|
| `package.json` | Add `dompurify@^3.3.2`, `@types/dompurify` |
| `src/gmail.ts` | Add `extractHtmlBody()`, modify `fetchMessageBody()` return |
| `src/sanitize.ts` | **NEW** — DOMPurify config + sanitize function + hooks |
| `src/main.ts` | Thread reader: iframe srcdoc rendering with fallback |
| `tests/sanitize.test.ts` | **NEW** — sanitization + XSS test suite |

## Risks & Tradeoffs

1. **DOMPurify CVE history** — mitigated by pinning ≥3.3.2 + iframe sandbox as defense-in-depth. Even if sanitizer is bypassed, `sandbox` without `allow-scripts allow-same-origin` blocks execution.
2. **Iframe height auto-resize** — can flicker. Mitigate with min-height on iframe + smooth transition.
3. **CSS email styles** — we strip `<style>` tags and inline `style` attributes for security. Some newsletter layouts may break. Acceptable tradeoff: safe > pretty for adversarial content. Can revisit with CSS sanitization later.
4. **Email size** — large HTML emails (>100KB) could slow rendering. Cap at 200KB raw HTML, fallback to plain text beyond that.

## Open questions

None — this is straightforward. Ship it.

## Definition of done

- HTML emails render with formatting (links clickable, tables visible, bold/italic correct)
- Remote images blocked by default, "Load images" button works
- DOMPurify ≥3.3.2 installed, zero additional transitive deps
- XSS test suite passes (5+ malicious payload vectors)
- `npm run build` exits 0
- Merged to main
