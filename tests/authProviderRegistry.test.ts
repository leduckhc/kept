import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerAuthProvider,
  getAuthProvider,
  getRegisteredAuthProviders,
  resetAuthRegistry,
} from '../src/authProviderRegistry';
import type { AuthProvider } from '../src/authProvider';

describe('authProviderRegistry', () => {
  beforeEach(() => resetAuthRegistry());

  it('registers and retrieves a provider by id', () => {
    const mockProvider = { id: 'gmail', displayName: 'Google' } as AuthProvider;
    registerAuthProvider('gmail', mockProvider);
    const result = getAuthProvider('gmail');
    expect(result.id).toBe('gmail');
    expect(result.displayName).toBe('Google');
  });

  it('throws when provider not registered', () => {
    expect(() => getAuthProvider('outlook'))
      .toThrow(/no auth provider registered/i);
  });

  it('can register multiple providers', () => {
    const gmail = { id: 'gmail', displayName: 'Google' } as AuthProvider;
    const outlook = { id: 'outlook', displayName: 'Outlook' } as AuthProvider;
    registerAuthProvider('gmail', gmail);
    registerAuthProvider('outlook', outlook);
    expect(getAuthProvider('gmail').id).toBe('gmail');
    expect(getAuthProvider('outlook').id).toBe('outlook');
  });

  it('getRegisteredAuthProviders returns all providers', () => {
    const gmail = { id: 'gmail', displayName: 'Google' } as AuthProvider;
    const outlook = { id: 'outlook', displayName: 'Outlook' } as AuthProvider;
    registerAuthProvider('gmail', gmail);
    registerAuthProvider('outlook', outlook);
    const all = getRegisteredAuthProviders();
    expect(all).toHaveLength(2);
    expect(all.map(p => p.id)).toContain('gmail');
    expect(all.map(p => p.id)).toContain('outlook');
  });

  it('resetAuthRegistry clears all providers', () => {
    const gmail = { id: 'gmail', displayName: 'Google' } as AuthProvider;
    registerAuthProvider('gmail', gmail);
    resetAuthRegistry();
    expect(() => getAuthProvider('gmail')).toThrow();
  });
});
