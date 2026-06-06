import type { AuthProvider } from './authProvider';

const _authProviders: Map<string, AuthProvider> = new Map();

export function registerAuthProvider(id: string, provider: AuthProvider): void {
  _authProviders.set(id, provider);
}

export function getAuthProvider(id: string): AuthProvider {
  const provider = _authProviders.get(id);
  if (!provider) throw new Error(`No auth provider registered for "${id}"`);
  return provider;
}

export function getRegisteredAuthProviders(): AuthProvider[] {
  return Array.from(_authProviders.values());
}

export function resetAuthRegistry(): void {
  _authProviders.clear();
}
