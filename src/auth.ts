// auth.ts — Google OAuth via tauri-plugin-oauth (localhost server) + tauri-plugin-shell (open browser)
/// <reference types="vite/client" />
import { start, cancel } from '@fabianlars/tauri-plugin-oauth';
import { open } from '@tauri-apps/plugin-shell';
import { getDb } from './db';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET ?? '';
const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ');

export interface Account {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
}

type AccountRow = {
  id: string; email: string; access_token: string;
  refresh_token: string; token_expiry: number;
};

function rowToAccount(r: AccountRow): Account {
  return {
    id: r.id,
    email: r.email,
    accessToken: r.access_token,
    refreshToken: r.refresh_token,
    tokenExpiry: r.token_expiry,
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
  return rows.map(rowToAccount);
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

  const db = await getDb();
  await db.execute('DELETE FROM threads WHERE account_id = ?', [account.id]);
  await db.execute('DELETE FROM messages WHERE account_id = ?', [account.id]);
  await db.execute('DELETE FROM blocked_senders WHERE account_id = ?', [account.id]);
  await db.execute('DELETE FROM settings WHERE account_id = ?', [account.id]);
  await db.execute('DELETE FROM accounts WHERE id = ?', [account.id]);
}

export async function saveAccount(account: Account): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT OR REPLACE INTO accounts (id, email, access_token, refresh_token, token_expiry)
     VALUES (?, ?, ?, ?, ?)`,
    [account.id, account.email, account.accessToken, account.refreshToken, account.tokenExpiry]
  );
}

export async function startOAuth(): Promise<Account> {
  const verifier = generateVerifier();
  const challenge = await pkceChallenge(verifier);
  const state = crypto.randomUUID();

  // tauri-plugin-oauth spawns a localhost server on a random port, returns the port
  const port = await start({
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

  // Open system browser
  await open(url.toString());

  // Wait for redirect — tauri-plugin-oauth fires a 'oauth://url' event with the full redirect URL
  const code = await waitForCode(state);

  try {
    return await exchangeCode(code, verifier, redirectUri);
  } finally {
    await cancel(port).catch(() => {});
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
  const res = await fetch('https://oauth2.googleapis.com/token', {
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
    access_token: string; refresh_token: string; expires_in: number;
  };
  const profile = await fetchProfile(tokens.access_token);
  const account: Account = {
    id: profile.id,
    email: profile.email,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiry: Date.now() + tokens.expires_in * 1000,
  };
  await saveAccount(account);
  return account;
}

async function fetchProfile(token: string): Promise<{ id: string; email: string }> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
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
  const res = await fetch('https://oauth2.googleapis.com/token', {
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
