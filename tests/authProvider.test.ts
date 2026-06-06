import { describe, it, expect } from 'vitest';
import { GoogleAuthProvider } from '../src/authProviders/google';
import type { AuthProvider } from '../src/authProvider';

describe('AuthProvider interface conformance', () => {
  it('GoogleAuthProvider implements AuthProvider', () => {
    const provider: AuthProvider = new GoogleAuthProvider();
    expect(provider.id).toBe('gmail');
    expect(provider.displayName).toBe('Google');
    expect(typeof provider.startOAuth).toBe('function');
    expect(typeof provider.refreshToken).toBe('function');
    expect(typeof provider.revokeToken).toBe('function');
    expect(typeof provider.getScopes).toBe('function');
  });

  it('GoogleAuthProvider returns correct scopes', () => {
    const provider = new GoogleAuthProvider();
    const scopes = provider.getScopes();
    expect(scopes).toContain('openid');
    expect(scopes).toContain('email');
    expect(scopes).toContain('https://www.googleapis.com/auth/gmail.modify');
    expect(scopes).toContain('https://www.googleapis.com/auth/gmail.send');
    expect(scopes.length).toBe(6);
  });
});
