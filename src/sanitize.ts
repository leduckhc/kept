// sanitize.ts — DOMPurify config + sanitization for HTML email rendering
import DOMPurify from 'dompurify';

/**
 * DOMPurify natively allows the `style` attribute and handles CSS safety.
 * We allow the <style> tag (FORCE_BODY ensures it's treated as body content)
 * so marketing emails with embedded CSS render correctly.
 *
 * Security: DOMPurify strips event handlers, javascript: URLs, and dangerous
 * elements (script, iframe, form, etc.) by default. We additionally block
 * SVG/MathML and enforce link safety via hooks.
 */
const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: [
    // Structure
    'p', 'div', 'span', 'a', 'br', 'hr', 'center', 'font',
    // Headings
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    // Text formatting
    'strong', 'em', 'b', 'i', 'u', 'sup', 'sub', 'small', 's', 'strike',
    // Lists
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    // Tables
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'col', 'colgroup',
    // Media
    'img',
    // Semantic
    'blockquote', 'pre', 'code',
    // Email-specific: allow <style> for embedded CSS rules
    'style',
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'width', 'height',
    'colspan', 'rowspan', 'target', 'class', 'rel',
    // DOMPurify handles style attribute safety natively
    'style',
    // Table/layout attributes common in email HTML
    'align', 'valign', 'bgcolor', 'color', 'background',
    'cellpadding', 'cellspacing', 'border', 'role',
    'dir', 'lang',
  ],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'form', 'input', 'textarea', 'select', 'button', 'object', 'embed', 'iframe', 'svg', 'math', 'link', 'meta', 'base'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onfocus', 'onblur', 'onsubmit', 'onreset', 'onchange', 'onkeydown', 'onkeyup'],
  ADD_ATTR: ['target', 'rel'],
  FORCE_BODY: true,
};

// Transparent 1×1 GIF placeholder for blocked images
const PLACEHOLDER_SRC = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

// Hook: remove forbidden elements that slip past FORBID_TAGS in some parsers
DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  const forbidden = ['form', 'input', 'textarea', 'select', 'button', 'object', 'embed', 'iframe', 'svg', 'math', 'script', 'link', 'meta', 'base'];
  if (forbidden.includes(data.tagName)) {
    node.parentNode?.removeChild(node);
  }
});

// Hook: block remote images + force external link safety
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  const el = node as Element;

  // Block remote images — replace with placeholder, store original src
  if (el.tagName === 'IMG') {
    const img = el as HTMLImageElement;
    const src = img.getAttribute('src') || '';
    if (src && !src.startsWith('data:') && !src.startsWith('cid:')) {
      img.setAttribute('data-original-src', src);
      img.setAttribute('src', PLACEHOLDER_SRC);
      if (!img.getAttribute('alt')) img.setAttribute('alt', '[image]');
    }
  }

  // Force external links to open in new tab
  if (el.tagName === 'A') {
    const anchor = el as HTMLAnchorElement;
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer');
    const href = anchor.getAttribute('href') || '';
    if (/^javascript:/i.test(href.trim())) {
      anchor.removeAttribute('href');
    }
  }
});

/**
 * Sanitize raw email HTML. Returns safe HTML string ready for direct DOM insertion.
 * DOMPurify handles style attribute safety natively — no manual CSS regex needed.
 * Caps input at 500 KB; returns empty string on oversized input (caller falls back to plain text).
 */
export function sanitizeEmailHtml(rawHtml: string): string {
  if (rawHtml.length > 500_000) return '';
  return DOMPurify.sanitize(rawHtml, DOMPURIFY_CONFIG) as unknown as string;
}
