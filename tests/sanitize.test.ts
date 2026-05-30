// sanitize.test.ts — XSS hardening + normal HTML preservation for email rendering
import { describe, it, expect } from 'vitest';
import { sanitizeEmailHtml } from '../src/sanitize';

describe('sanitizeEmailHtml — XSS vectors stripped', () => {
  it('strips <script> tags', () => {
    const out = sanitizeEmailHtml('<p>Hello</p><script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
    expect(out).toContain('Hello');
  });

  it('strips inline event handlers (onerror)', () => {
    const out = sanitizeEmailHtml('<img src="x" onerror="alert(1)">');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('alert(1)');
  });

  it('strips inline event handlers (onclick)', () => {
    const out = sanitizeEmailHtml('<div onclick="evil()">click me</div>');
    expect(out).not.toContain('onclick');
  });

  it('strips javascript: hrefs', () => {
    const out = sanitizeEmailHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toMatch(/href=["']javascript:/i);
  });

  it('strips inline style attributes (CSS-based attacks)', () => {
    const out = sanitizeEmailHtml('<div style="background:url(evil.php)">text</div>');
    expect(out).not.toContain('style=');
    expect(out).toContain('text');
  });

  it('strips <style> tags', () => {
    const out = sanitizeEmailHtml('<style>body{background:url(x)}</style><p>ok</p>');
    expect(out).not.toContain('<style');
    expect(out).toContain('ok');
  });

  it('strips <form> and <input> elements', () => {
    const out = sanitizeEmailHtml('<form action="/phish"><input type="password" name="p"></form>');
    expect(out).not.toContain('<form');
    expect(out).not.toContain('<input');
  });

  it('strips onmouseover event handler', () => {
    const out = sanitizeEmailHtml('<a onmouseover="leak(document.cookie)">hover</a>');
    expect(out).not.toContain('onmouseover');
  });

  it('strips data-uri src that is not an image', () => {
    // data: non-image URIs should not cause remote image blocking bypass
    const out = sanitizeEmailHtml('<img src="data:text/html,<script>alert(1)</script>">');
    // DOMPurify will strip this or keep a safe src — should not contain script in output
    expect(out).not.toContain('<script');
  });
});

describe('sanitizeEmailHtml — normal HTML preserved', () => {
  it('preserves links with href', () => {
    const out = sanitizeEmailHtml('<a href="https://example.com">Visit</a>');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('Visit');
  });

  it('forces target=_blank on links', () => {
    const out = sanitizeEmailHtml('<a href="https://example.com">link</a>');
    expect(out).toContain('target="_blank"');
  });

  it('adds rel=noopener to links', () => {
    const out = sanitizeEmailHtml('<a href="https://example.com">link</a>');
    expect(out).toContain('noopener');
  });

  it('preserves table structure', () => {
    const out = sanitizeEmailHtml('<table><tr><td>Cell 1</td><td>Cell 2</td></tr></table>');
    expect(out).toContain('<table');
    expect(out).toContain('<td>Cell 1</td>');
    expect(out).toContain('<td>Cell 2</td>');
  });

  it('preserves bold and italic', () => {
    const out = sanitizeEmailHtml('<p><strong>Bold</strong> and <em>italic</em></p>');
    expect(out).toContain('<strong>Bold</strong>');
    expect(out).toContain('<em>italic</em>');
  });

  it('blocks remote images and stores data-original-src', () => {
    const out = sanitizeEmailHtml('<img src="https://tracker.example.com/pixel.gif" alt="pixel">');
    expect(out).toContain('data-original-src="https://tracker.example.com/pixel.gif"');
    // src should be the placeholder (1x1 transparent gif), not the remote URL
    expect(out).toContain('data:image/gif;base64,');
    // The src= attribute must point to the placeholder, not the remote URL
    const srcMatch = out.match(/\bsrc="([^"]+)"/);
    expect(srcMatch?.[1]).toMatch(/^data:image\/gif/);
  });

  it('does not block data-URI images (inline images are safe)', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const out = sanitizeEmailHtml(`<img src="${dataUri}" alt="inline">`);
    expect(out).toContain(`src="${dataUri}"`);
    expect(out).not.toContain('data-original-src');
  });

  it('preserves blockquote', () => {
    const out = sanitizeEmailHtml('<blockquote>Quoted text</blockquote>');
    expect(out).toContain('<blockquote>Quoted text</blockquote>');
  });

  it('returns empty string for HTML exceeding 200 KB cap', () => {
    const huge = '<p>' + 'x'.repeat(200_001) + '</p>';
    const out = sanitizeEmailHtml(huge);
    expect(out).toBe('');
  });
});

describe('sanitizeEmailHtml — no data attributes leaked', () => {
  it('strips data-* attributes', () => {
    const out = sanitizeEmailHtml('<div data-secret="token123">text</div>');
    expect(out).not.toContain('data-secret');
  });
});
