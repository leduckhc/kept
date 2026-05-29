// auth.ts — Google OAuth via Tauri shell (system browser) + local redirect
import { getDb } from './db';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const REDIRECT_URI = 'http://127.0.0.1:9004/oauth/callback';
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

export async function getAccount(): Promise<Account | null> {
  const db = await getDb();
  const rows = await db.select<Array<{
    id: string; email: string; access_token: string;
    refresh_token: string; token_expiry: number;
  }>>('SELECT * FROM accounts LIMIT 1');
  if (!rows.length) return null;
  const r = rows[0];
  return { id: r.id, email: r.email, accessToken: r.access_token, refreshToken: r.refresh_token, tokenExpiry: r.token_expiry };
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

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');

  // Open in system browser
  const { open } = await import('@tauri-apps/plugin-shell');
  await open(url.toString());

  // Listen for redirect on localhost:9004
  const code = await waitForOAuthCode(state);
  return await exchangeCode(code, verifier);
}

async function waitForOAuthCode(expectedState: string): Promise<string> {
  // Tauri custom protocol / deep link not yet configured — poll approach
  // In production use tauri-plugin-deep-link; for now use a simple HTTP listener
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('OAuth timeout')), 120_000);
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:9004/oauth/poll?state=${expectedState}`);
        if (res.ok) {
          const { code } = await res.json() as { code: string };
          if (code) {
            clearInterval(poll);
            clearTimeout(timeout);
            resolve(code);
          }
        }
      } catch { /* server not ready yet */ }
    }, 500);
  });
}

async function exchangeCode(code: string, verifier: string): Promise<Account> {
  const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET ?? '';
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });
  const tokens = await res.json() as {
    access_token: string; refresh_token: string;
    expires_in: number; id_token?: string;
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
  return res.json() as Promise<{ id: string; email: string }>;
}

export async function ensureFreshToken(account: Account): Promise<Account> {
  if (Date.now() < account.tokenExpiry - 60_000) return account;
  const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET ?? '';
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: account.refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: clientSecret,
    }),
  });
  const tokens = await res.json() as { access_token: string; expires_in: number };
  const updated: Account = { ...account, accessToken: tokens.access_token, tokenExpiry: Date.now() + tokens.expires_in * 1000 };
  await saveAccount(updated);
  return updated;
}

// ── PKCE helpers ──────────────────────────────────────────
function generateVerifier(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function pkceChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
