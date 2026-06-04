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

/**
 * In-memory cache: avoids repeated OS keychain prompts.
 * Keychain is read once per email per session; writes update both cache and keychain.
 */
const _tokenCache: Map<string, StoredTokens> = new Map();

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
 * Also updates the in-memory cache so subsequent reads don't hit keychain.
 */
export async function saveTokensToKeychain(email: string, tokens: StoredTokens): Promise<void> {
  _tokenCache.set(email, tokens);
  const kr = await getKeyring();
  if (!kr) return;
  await kr.setPassword(SERVICE, email, JSON.stringify(tokens));
}

/**
 * Retrieve tokens from OS keychain. Returns null if not found.
 * Uses in-memory cache to avoid repeated keychain access prompts.
 */
export async function getTokensFromKeychain(email: string): Promise<StoredTokens | null> {
  // Return from cache if available (no OS prompt)
  const cached = _tokenCache.get(email);
  if (cached) return cached;

  try {
    const kr = await getKeyring();
    if (!kr) return null;
    const raw = await kr.getPassword(SERVICE, email);
    if (!raw) return null;
    const tokens = JSON.parse(raw) as StoredTokens;
    _tokenCache.set(email, tokens);
    return tokens;
  } catch {
    return null;
  }
}

/**
 * Delete tokens from OS keychain (used on logout/account removal).
 * Also clears the in-memory cache.
 */
export async function deleteTokensFromKeychain(email: string): Promise<void> {
  _tokenCache.delete(email);
  try {
    const kr = await getKeyring();
    if (!kr) return;
    await kr.deletePassword(SERVICE, email);
  } catch {
    // Key might not exist — that's fine
  }
}
