/**
 * keychain.ts — Store/retrieve OAuth tokens from the OS keychain.
 * macOS: Keychain Services
 * Windows: Credential Manager
 * Linux: Secret Service (GNOME Keyring / KDE Wallet)
 *
 * In browser E2E mode, keychain is unavailable — functions gracefully no-op/return null.
 */

const SERVICE = 'com.kept.app';

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
}

let _keyring: typeof import('tauri-plugin-keyring-api') | null = null;
async function getKeyring() {
  if (!_keyring) {
    if (!('__TAURI_INTERNALS__' in window)) return null;
    _keyring = await import('tauri-plugin-keyring-api');
  }
  return _keyring;
}

/**
 * Save tokens to OS keychain, keyed by account email.
 */
export async function saveTokensToKeychain(email: string, tokens: StoredTokens): Promise<void> {
  const kr = await getKeyring();
  if (!kr) return;
  await kr.setPassword(SERVICE, email, JSON.stringify(tokens));
}

/**
 * Retrieve tokens from OS keychain. Returns null if not found.
 */
export async function getTokensFromKeychain(email: string): Promise<StoredTokens | null> {
  try {
    const kr = await getKeyring();
    if (!kr) return null;
    const raw = await kr.getPassword(SERVICE, email);
    if (!raw) return null;
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return null;
  }
}

/**
 * Delete tokens from OS keychain (used on logout/account removal).
 */
export async function deleteTokensFromKeychain(email: string): Promise<void> {
  try {
    const kr = await getKeyring();
    if (!kr) return;
    await kr.deletePassword(SERVICE, email);
  } catch {
    // Key might not exist — that's fine
  }
}
