// sanitize.ts — DOMPurify config + sanitization for HTML email rendering
import DOMPurify from 'dompurify';

interface PurifyConfig {
  ALLOWED_TAGS: string[];
  ALLOWED_ATTR: string[];
  ALLOW_DATA_ATTR: boolean;
  FORBID_TAGS: string[];
  FORBID_ATTR: string[];
  ADD_ATTR: string[];
}

const DOMPURIFY_CONFIG: PurifyConfig = {
  ALLOWED_TAGS: [
    'p', 'div', 'span', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
    'ul', 'ol', 'li', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'em', 'b', 'i', 'u', 'blockquote', 'pre', 'code', 'sup', 'sub',
    'dl', 'dt', 'dd', 'caption', 'col', 'colgroup', 'center', 'font',
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'width', 'height', 'colspan', 'rowspan',
    'target', 'class', 'rel', 'style', 'align', 'valign', 'bgcolor', 'color',
    'cellpadding', 'cellspacing', 'border',
  ],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'form', 'input', 'textarea', 'select', 'button', 'object', 'embed', 'iframe', 'svg', 'math', 'link', 'meta'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onfocus', 'onblur', 'onsubmit', 'onreset', 'onchange'],
  ADD_ATTR: ['target', 'rel'],
};

// Dangerous CSS properties that could break layout or enable attacks
const DANGEROUS_CSS_RE = /position\s*:\s*(fixed|sticky)|z-index\s*:\s*\d|pointer-events\s*:\s*none|opacity\s*:\s*0[^.]|display\s*:\s*none/gi;

// Transparent 1×1 GIF placeholder for blocked images
const PLACEHOLDER_SRC = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

// Hook: remove forbidden elements that some DOM parsers fail to strip via FORBID_TAGS
DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  const forbidden = ['form', 'input', 'textarea', 'select', 'button', 'object', 'embed', 'iframe', 'svg', 'math', 'script', 'style', 'link', 'meta'];
  if (forbidden.includes(data.tagName)) {
    node.parentNode?.removeChild(node);
  }
});

// Hook: sanitize style attributes, block remote images, force external link behaviour
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  const el = node as Element;

  // Sanitize style attribute — strip dangerous properties
  if (el.hasAttribute && el.hasAttribute('style')) {
    const style = el.getAttribute('style') || '';
    const cleaned = style.replace(DANGEROUS_CSS_RE, '');
    if (cleaned.trim()) {
      el.setAttribute('style', cleaned);
    } else {
      el.removeAttribute('style');
    }
  }

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
 * Caps input at 500 KB; returns empty string on oversized input (caller falls back to plain text).
 */
export function sanitizeEmailHtml(rawHtml: string): string {
  if (rawHtml.length > 500_000) return '';
  return DOMPurify.sanitize(rawHtml, DOMPURIFY_CONFIG) as unknown as string;
}
