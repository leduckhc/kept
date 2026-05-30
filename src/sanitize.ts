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
    'dl', 'dt', 'dd', 'caption', 'col', 'colgroup',
  ],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'width', 'height', 'colspan', 'rowspan', 'target', 'class', 'rel'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['style', 'script', 'form', 'input', 'textarea', 'select', 'button', 'object', 'embed', 'iframe', 'svg', 'math'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onfocus', 'onblur', 'style'],
  ADD_ATTR: ['target', 'rel'], // allow target="_blank" + rel on links
};

// Transparent 1×1 GIF placeholder for blocked images
const PLACEHOLDER_SRC = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

// Hook: remove forbidden elements that some DOM parsers fail to strip via FORBID_TAGS
DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  const forbidden = ['form', 'input', 'textarea', 'select', 'button', 'object', 'embed', 'iframe', 'svg', 'math', 'script', 'style'];
  if (forbidden.includes(data.tagName)) {
    node.parentNode?.removeChild(node);
  }
});

// Hook: block remote images + force external link behaviour
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if ((node as Element).tagName === 'IMG') {
    const el = node as HTMLImageElement;
    const src = el.getAttribute('src') || '';
    if (src && !src.startsWith('data:')) {
      el.setAttribute('data-original-src', src);
      el.setAttribute('src', PLACEHOLDER_SRC);
      if (!el.getAttribute('alt')) el.setAttribute('alt', '[image]');
    }
  }
  if ((node as Element).tagName === 'A') {
    const el = node as HTMLAnchorElement;
    el.setAttribute('target', '_blank');
    el.setAttribute('rel', 'noopener noreferrer');
    // Strip javascript: hrefs
    const href = el.getAttribute('href') || '';
    if (/^javascript:/i.test(href.trim())) {
      el.removeAttribute('href');
    }
  }
});

/**
 * Sanitize raw email HTML. Returns safe HTML string ready for iframe srcdoc.
 * Caps input at 200 KB; returns empty string on oversized input (caller falls back to plain text).
 */
export function sanitizeEmailHtml(rawHtml: string): string {
  if (rawHtml.length > 200_000) return '';
  return DOMPurify.sanitize(rawHtml, DOMPURIFY_CONFIG) as unknown as string;
}
