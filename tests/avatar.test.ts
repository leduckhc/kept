import { describe, it, expect } from 'vitest';
import { sha256Sync, gravatarUrl } from '../src/avatar';

describe('sha256Sync', () => {
  it('matches Gravatar docs test vector', () => {
    // From https://docs.gravatar.com/rest/hash/
    expect(sha256Sync('myemailaddress@example.com'))
      .toBe('84059b07d4be67b806386c0aad8070a23f18836bbaae342275dc0a83414c32ee');
  });

  it('empty string', () => {
    // Known SHA-256 of empty string
    expect(sha256Sync(''))
      .toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('gravatarUrl', () => {
  it('uses SHA-256 hash and gravatar.com (no www)', () => {
    const url = gravatarUrl('MyEmailAddress@example.com');
    expect(url).toBe('https://gravatar.com/avatar/84059b07d4be67b806386c0aad8070a23f18836bbaae342275dc0a83414c32ee?s=64&d=404');
  });

  it('trims and lowercases', () => {
    const url = gravatarUrl('  Test@Example.COM  ');
    const expected = gravatarUrl('test@example.com');
    expect(url).toBe(expected);
  });
});
