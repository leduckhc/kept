// auth.ts — Google OAuth via tauri-plugin-oauth (localhost server) + tauri-plugin-shell (open browser)
/// <reference types="vite/client" />
import { getDb } from './db';
import { saveTokensToKeychain, getTokensFromKeychain, deleteTokensFromKeychain } from './keychain';

/** Retry fetch on 429/5xx with exponential backoff (max 3 attempts). */
async function fetchRetry(url: string, init: RequestInit): Promise<Response> {
  const MAX = 3;
  for (let attempt = 1; attempt <= MAX; attempt++) {
    const res = await fetch(url, init);
    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      if (attempt === MAX) return res;
      const retryAfter = res.headers.get('Retry-After');
      const delay = retryAfter ? Math.min(parseInt(retryAfter, 10) * 1000, 30000) : 1000 * Math.pow(2, attempt - 1);
      console.warn(`Auth ${res.status} on ${url}, retry ${attempt}/${MAX} in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
    return res;
  }
  throw new Error('fetchRetry: unreachable');
}

// Tauri plugins loaded lazily — they crash in browser context
let _oauth: typeof import('@fabianlars/tauri-plugin-oauth') | null = null;
let _shell: typeof import('@tauri-apps/plugin-shell') | null = null;
async function getTauriOAuth() {
  if (!_oauth) _oauth = await import('@fabianlars/tauri-plugin-oauth');
  return _oauth;
}
async function getTauriShell() {
  if (!_shell) _shell = await import('@tauri-apps/plugin-shell');
  return _shell;
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET || '';
const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/contacts.other.readonly',
].join(' ');

export interface Account {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
  signature: string;
  colorIndex: number;
  provider: 'gmail' | 'outlook' | 'm365';
}

type AccountRow = {
  id: string; email: string; access_token: string;
  refresh_token: string; token_expiry: number; signature: string | null;
  color_index: number | null; provider: string | null;
};

async function rowToAccount(r: AccountRow): Promise<Account> {
  // Try keychain first — tokens in SQLite are legacy fallback
  const keychainTokens = await getTokensFromKeychain(r.email);
  if (keychainTokens) {
    return {
      id: r.id,
      email: r.email,
      accessToken: keychainTokens.accessToken,
      refreshToken: keychainTokens.refreshToken,
      tokenExpiry: keychainTokens.tokenExpiry,
      signature: r.signature ?? '',
      colorIndex: r.color_index ?? 0,
      provider: (r.provider as Account['provider']) ?? 'gmail',
    };
  }
  // Fallback: use SQLite tokens (pre-migration accounts)
  return {
    id: r.id,
    email: r.email,
    accessToken: r.access_token,
    refreshToken: r.refresh_token,
    tokenExpiry: r.token_expiry,
    signature: r.signature ?? '',
    colorIndex: r.color_index ?? 0,
    provider: (r.provider as Account['provider']) ?? 'gmail',
  };
}

/** Legacy single-account helper — returns first account, or null. */
export async function getAccount(): Promise<Account | null> {
  const db = await getDb();
  const rows = await db.select<AccountRow[]>('SELECT * FROM accounts LIMIT 1');
  if (!rows.length) return null;
  return rowToAccount(rows[0]);
}

/** Return all accounts ordered by creation time. */
export async function getAllAccounts(): Promise<Account[]> {
  const db = await getDb();
  const rows = await db.select<AccountRow[]>('SELECT * FROM accounts ORDER BY created_at ASC');
  return Promise.all(rows.map(rowToAccount));
}

/** Return a specific account by id, or null if not found. */
export async function getAccountById(id: string): Promise<Account | null> {
  const db = await getDb();
  const rows = await db.select<AccountRow[]>(
    'SELECT * FROM accounts WHERE id = ?', [id]
  );
  if (!rows.length) return null;
  return rowToAccount(rows[0]);
}

/** Remove an account and all its data. Also revokes the Google token. */
export async function removeAccount(account: Account): Promise<void> {
  // Best-effort token revocation — don't fail if it errors
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(account.accessToken)}`, {
      method: 'POST',
    });
  } catch { /* ignore */ }

  // Remove tokens from OS keychain
  await deleteTokensFromKeychain(account.email);

  const db = await getDb();
  await db.execute('DELETE FROM threads WHERE account_id = ?', [account.id]);
  await db.execute('DELETE FROM messages WHERE account_id = ?', [account.id]);
  await db.execute('DELETE FROM blocked_senders WHERE account_id = ?', [account.id]);
  await db.execute('DELETE FROM settings WHERE account_id = ?', [account.id]);
  await db.execute('DELETE FROM accounts WHERE id = ?', [account.id]);
}

export async function saveAccount(account: Account): Promise<void> {
  // Try OS keychain first (encrypted by OS). Fall back to SQLite if unavailable.
  let keychainOk = false;
  try {
    await saveTokensToKeychain(account.email, {
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      tokenExpiry: account.tokenExpiry,
    });
    keychainOk = true;
  } catch (e) {
    console.warn('Keychain unavailable, falling back to SQLite for token storage:', e);
  }

  const db = await getDb();
  if (keychainOk) {
    // Keychain has the secrets — SQLite stores only metadata
    await db.execute(
       `INSERT OR REPLACE INTO accounts (id, email, access_token, refresh_token, token_expiry, signature, color_index, provider)
        VALUES (?, ?, '', '', 0, ?, ?, ?)`,
       [account.id, account.email, account.signature ?? '', account.colorIndex ?? 0, account.provider ?? 'gmail']
    );
  } else {
    // Fallback: store tokens in SQLite (same as before keychain feature)
    await db.execute(
       `INSERT OR REPLACE INTO accounts (id, email, access_token, refresh_token, token_expiry, signature, color_index, provider)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
       [account.id, account.email, account.accessToken, account.refreshToken, account.tokenExpiry, account.signature ?? '', account.colorIndex ?? 0, account.provider ?? 'gmail']
    );
  }
}

export async function startOAuth(): Promise<Account> {
  const verifier = generateVerifier();
  const challenge = await pkceChallenge(verifier);
  const state = crypto.randomUUID();

  // tauri-plugin-oauth spawns a localhost server on a random port, returns the port
  const oauth = await getTauriOAuth();
  const port = await oauth.start({
    response: '<html><body><h2>Login successful — you can close this tab.</h2></body></html>',
  });

  const redirectUri = `http://127.0.0.1:${port}`;

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  // Request non-granular consent — user must grant all scopes or cancel
  url.searchParams.set('include_granted_scopes', 'true');

  // Open system browser
  const shell = await getTauriShell();
  await shell.open(url.toString());

  // Wait for redirect — tauri-plugin-oauth fires a 'oauth://url' event with the full redirect URL
  const code = await waitForCode(state);

  try {
    return await exchangeCode(code, verifier, redirectUri);
  } finally {
    await oauth.cancel(port).catch(() => {});
  }
}

function waitForCode(expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let unlisten: (() => void) | undefined;

    const timeout = setTimeout(() => {
      unlisten?.();
      reject(new Error('OAuth timeout after 2 minutes'));
    }, 120_000);

    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<string>('oauth://url', (event) => {
        try {
          const url = new URL(event.payload);
          const returnedState = url.searchParams.get('state');
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');
          if (error) { clearTimeout(timeout); unlisten?.(); reject(new Error(`OAuth error: ${error}`)); return; }
          if (returnedState !== expectedState || !code) return;
          clearTimeout(timeout);
          unlisten?.();
          resolve(code);
        } catch { /* ignore */ }
      }).then((fn) => { unlisten = fn; });
    });
  });
}

async function exchangeCode(code: string, verifier: string, redirectUri: string): Promise<Account> {
  const res = await fetchRetry('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  const tokens = await res.json() as {
    access_token: string; refresh_token?: string; expires_in: number;
  };
  const profile = await fetchProfile(tokens.access_token);

  // If Google didn't return a refresh_token (re-auth), try existing keychain
  let refreshToken = tokens.refresh_token;
  if (!refreshToken) {
    const existing = await getTokensFromKeychain(profile.email);
    if (existing?.refreshToken) {
      refreshToken = existing.refreshToken;
    } else {
      throw new Error('No refresh_token returned by Google and none found in keychain. Please revoke app access in Google Account settings and try again.');
    }
  }

  // Auto-assign next available color index
  const existingAccounts = await getAllAccounts();
  const colorIndex = existingAccounts.length;

  const account: Account = {
    id: profile.id,
    email: profile.email,
    accessToken: tokens.access_token,
    refreshToken: refreshToken,
    tokenExpiry: Date.now() + tokens.expires_in * 1000,
    signature: '',
    colorIndex,
    provider: 'gmail',
  };
  await saveAccount(account);
  return account;
}

async function fetchProfile(token: string): Promise<{ id: string; email: string }> {
  const res = await fetchRetry('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`);
  return res.json() as Promise<{ id: string; email: string }>;
}

// Per-account mutex: map from account_id → in-flight refresh promise
// Prevents race conditions when two parallel syncs call ensureFreshToken simultaneously.
const _refreshInFlight: Map<string, Promise<Account>> = new Map();

export async function ensureFreshToken(account: Account): Promise<Account> {
  if (Date.now() < account.tokenExpiry - 60_000) return account;

  // If a refresh is already in flight for this account, reuse it
  const existing = _refreshInFlight.get(account.id);
  if (existing) return existing;

  const promise = _doRefreshToken(account).finally(() => {
    _refreshInFlight.delete(account.id);
  });
  _refreshInFlight.set(account.id, promise);
  return promise;
}

async function _doRefreshToken(account: Account): Promise<Account> {
  if (!account.refreshToken) {
    throw new Error(`Cannot refresh token for ${account.email}: no refresh_token available. Please re-authenticate this account.`);
  }
  const res = await fetchRetry('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: account.refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const tokens = await res.json() as { access_token: string; expires_in: number };
  const updated: Account = {
    ...account,
    accessToken: tokens.access_token,
    tokenExpiry: Date.now() + tokens.expires_in * 1000,
  };
  await saveAccount(updated);
  return updated;
}

// ── Migration ────────────────────────────────────────────
/**
 * One-time migration: move tokens from SQLite → OS keychain.
 * Call on boot. If tokens exist in SQLite, save to keychain and clear them from DB.
 */
export async function migrateTokensToKeychain(): Promise<void> {
  const db = await getDb();
  let rows: AccountRow[];
  try {
    rows = await db.select<AccountRow[]>(
      "SELECT * FROM accounts WHERE access_token != '' AND access_token IS NOT NULL"
    );
  } catch { return; }

  for (const row of rows) {
    if (row.access_token && row.refresh_token) {
      try {
        await saveTokensToKeychain(row.email, {
          accessToken: row.access_token,
          refreshToken: row.refresh_token,
          tokenExpiry: row.token_expiry,
        });
        // Clear secrets from SQLite only if keychain write succeeded
        await db.execute(
          "UPDATE accounts SET access_token = '', refresh_token = '', token_expiry = 0 WHERE id = ?",
          [row.id]
        );
      } catch {
        // Keychain unavailable — leave tokens in SQLite, they'll work via fallback
      }
    }
  }
}

// ── PKCE ─────────────────────────────────────────────────
function generateVerifier(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function pkceChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
