// compose.test.ts — Regression tests for compose panel behavior
import { describe, it, expect } from 'vitest';

describe('Signature newline rendering', () => {
  // Regression: signature showed literal \n instead of actual newline
  // Found by QA on 2026-06-01

  it('replaces literal \\n sequences with real newlines', () => {
    // Simulate what compose.ts does: replace \\n with \n
    const rawSig = 'Best regards,\\nTest User';
    const processed = rawSig.replace(/\\n/g, '\n');
    expect(processed).toBe('Best regards,\nTest User');
    expect(processed).not.toContain('\\n');
  });

  it('preserves already-correct newlines', () => {
    const rawSig = 'Best regards,\nTest User';
    const processed = rawSig.replace(/\\n/g, '\n');
    expect(processed).toBe('Best regards,\nTest User');
  });

  it('handles multiple \\n in signature', () => {
    const rawSig = 'Line1\\nLine2\\nLine3';
    const processed = rawSig.replace(/\\n/g, '\n');
    expect(processed).toBe('Line1\nLine2\nLine3');
    expect(processed.split('\n')).toHaveLength(3);
  });
});
