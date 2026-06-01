/**
 * keychain.ts — Store/retrieve OAuth tokens from the OS keychain.
 * macOS: Keychain Services
 * Windows: Credential Manager
 * Linux: Secret Service (GNOME Keyring / KDE Wallet)
 */
import { getPassword, setPassword, deletePassword } from 'tauri-plugin-keyring-api';

const SERVICE = 'com.kept.app';

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
}

/**
 * Save tokens to OS keychain, keyed by account email.
 */
export async function saveTokensToKeychain(email: string, tokens: StoredTokens): Promise<void> {
  await setPassword(SERVICE, email, JSON.stringify(tokens));
}

/**
 * Retrieve tokens from OS keychain. Returns null if not found.
 */
export async function getTokensFromKeychain(email: string): Promise<StoredTokens | null> {
  try {
    const raw = await getPassword(SERVICE, email);
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
    await deletePassword(SERVICE, email);
  } catch {
    // Key might not exist — that's fine
  }
}
