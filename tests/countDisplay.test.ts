import { describe, it, expect } from 'vitest';
import { countDisplay } from '../src/solid/ThreadList';

describe('countDisplay', () => {
  it('shows exact number for 1-9', () => {
    expect(countDisplay(1)).toBe('1');
    expect(countDisplay(5)).toBe('5');
    expect(countDisplay(9)).toBe('9');
  });

  it('caps at 9+ for 10 and above', () => {
    expect(countDisplay(10)).toBe('9+');
    expect(countDisplay(24)).toBe('9+');
    expect(countDisplay(142)).toBe('9+');
    expect(countDisplay(999)).toBe('9+');
  });
});
