import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createBridgeAvailabilityProbe,
  createTauriGmailBridge,
  exchangeAuthorizationCode,
  invokeGmailSend,
  redactBridgeError,
} from '../src/tauri-gmail-bridge-core.js';

const accountId = 'acct_local_gmail';

function makeMailCore({ savedTokens = [] } = {}) {
  return {
    async createPkcePair() {
      return { verifier: 'verifier-secret', challenge: 'challenge-public', method: 'S256' };
    },
    createGmailOAuthUrl({ clientId, redirectUri, state, codeChallenge }) {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.readonly');
      url.searchParams.set('state', state);
      url.searchParams.set('code_challenge', codeChallenge);
      return url;
    },
    parseGmailOAuthCallback(callbackUrl, { expectedState }) {
      const parsed = new URL(callbackUrl);
      assert.equal(parsed.searchParams.get('state'), expectedState);
      return { ok: true, state: expectedState, code: parsed.searchParams.get('code') };
    },
    createKeychainTokenStore({ keychain }) {
      return {
        async saveTokens(id, tokens) {
          savedTokens.push({ accountId: id, tokens });
          await keychain.setPassword('kept.gmail.oauth', id, JSON.stringify(tokens));
        },
        async loadTokens(id) {
          const raw = await keychain.getPassword('kept.gmail.oauth', id);
          return raw ? JSON.parse(raw) : null;
        },
      };
    },
    createGmailApiConnector({ tokenStore, fetchImpl, accountId: id }) {
      return {
        provider: 'gmail',
        accountId: id,
        tokenStore,
        fetchImpl,
        async listRecentMessages() { return { historyId: 'h1', messages: [] }; },
      };
    },
  };
}

test('bridge availability probe only enables Gmail when Tauri invoke exists', () => {
  assert.equal(createBridgeAvailabilityProbe({} as any).available, false);
  assert.equal(createBridgeAvailabilityProbe({ __TAURI__: { core: { invoke() {} } } } as any).available, true);
});

test('startOAuth uses readonly OAuth config, loopback callback parsing, and keychain token persistence', async () => {
  const invocations = [];
  const keychain = new Map();
  const savedTokens = [];
  const bridge = createTauriGmailBridge({
    mailCore: makeMailCore({ savedTokens }) as any as any,
    randomState: () => 'state-secret',
    invoke: async (command, payload) => {
      invocations.push({ command, payload });
      if (command === 'gmail_oauth_config') {
        return {
          enabled: true,
          clientId: 'desktop-client.apps.googleusercontent.com',
          redirectUri: 'http://127.0.0.1:49210/oauth/google/callback',
          tokenUrl: 'https://oauth2.googleapis.com/token',
          callbackTimeoutMs: 1000,
        };
      }
      if (command === 'gmail_start_oauth') {
        assert.match(payload.authUrl, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/);
        const authUrl = new URL(payload.authUrl);
        assert.equal(authUrl.searchParams.get('scope'), 'https://www.googleapis.com/auth/gmail.readonly');
        assert.equal(authUrl.searchParams.get('state'), 'state-secret');
        assert.equal(authUrl.searchParams.get('code_challenge'), 'challenge-public');
        const callbackUrl = new URL('http://127.0.0.1:49210/oauth/google/callback');
        callbackUrl.searchParams.set('state', 'state-secret');
        callbackUrl.searchParams.set('code', 'real-auth-code');
        return String(callbackUrl);
      }
      if (command === 'gmail_keychain_set') {
        keychain.set(`${payload.service}:${payload.account}`, payload.secret);
        return { stored: true };
      }
      if (command === 'gmail_keychain_get') return keychain.get(`${payload.service}:${payload.account}`) || null;
      throw new Error(`unexpected command ${command}`);
    },
    fetchImpl: async (url: any, options: any) => {
      assert.equal(String(url), 'https://oauth2.googleapis.com/token');
      assert.equal(options.method, 'POST');
      const body = new URLSearchParams(options.body);
      assert.equal(body.get('grant_type'), 'authorization_code');
      assert.equal(body.get('client_id'), 'desktop-client.apps.googleusercontent.com');
      assert.equal(body.get('redirect_uri'), 'http://127.0.0.1:49210/oauth/google/callback');
      assert.equal(body.get('code'), 'real-auth-code');
      assert.equal(body.get('code_verifier'), 'verifier-secret');
      return { ok: true, async json() { return { access_token: 'access-value', refresh_token: 'refresh-value', expires_in: 3600, token_type: 'Bearer' }; } } as unknown as Response;
    },
  });

  const result = await bridge.startOAuth({ accountId });
  assert.deepEqual(result, { accountId, stored: 'keychain' });
  assert.equal(savedTokens.length, 1);
  assert.equal(savedTokens[0].accountId, accountId);
  assert.equal(savedTokens[0].tokens.accessToken, 'access-value');
  assert.equal(savedTokens[0].tokens.refreshToken, 'refresh-value');
  assert.equal(savedTokens[0].tokens.tokenType, 'Bearer');
  assert.equal(savedTokens[0].tokens.scope, 'https://www.googleapis.com/auth/gmail.readonly');
  assert.match(savedTokens[0].tokens.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(invocations.map((entry) => entry.command), [
    'gmail_oauth_config',
    'gmail_start_oauth',
    'gmail_keychain_set',
  ]);
});

test('exchangeAuthorizationCode normalizes Google snake_case tokens for the mail-core keychain store', async () => {
  const tokens = await (exchangeAuthorizationCode as any)({
    fetchImpl: async (_url: any, _options: any) => ({
      ok: true,
      async json() {
        return {
          access_token: 'access-value',
          refresh_token: 'refresh-value',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'https://www.googleapis.com/auth/gmail.readonly',
        };
      },
    }),
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: 'desktop-client.apps.googleusercontent.com',
    redirectUri: 'http://127.0.0.1:49210/oauth/google/callback',
    code: 'real-auth-code',
    verifier: 'verifier-secret',
  });

  assert.equal(tokens.accessToken, 'access-value');
  assert.equal(tokens.refreshToken, 'refresh-value');
  assert.equal(tokens.tokenType, 'Bearer');
  assert.equal(tokens.scope, 'https://www.googleapis.com/auth/gmail.readonly');
  assert.match(tokens.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('exchangeAuthorizationCode includes client_secret when packaged with a Google Web OAuth client', async () => {
  await exchangeAuthorizationCode({
    fetchImpl: async (_url, options) => {
      const body = new URLSearchParams(options.body);
      assert.equal(body.get('client_id'), 'web-client.apps.googleusercontent.com');
      assert.equal(body.get('client_secret'), 'web-client-secret');
      return { ok: true, async json() { return { access_token: 'access-value', expires_in: 3600 }; } };
    },
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: 'web-client.apps.googleusercontent.com',
    clientSecret: 'web-client-secret',
    redirectUri: 'http://127.0.0.1:49210/oauth/google/callback',
    code: 'real-auth-code',
    verifier: 'verifier-secret',
  });
});

test('exchangeAuthorizationCode surfaces safe Google token exchange errors after loopback callback', async () => {
  await assert.rejects(
    (exchangeAuthorizationCode as any)({
      fetchImpl: async () => ({
        ok: false,
        status: 400,
        async json() {
          return {
            error: 'invalid_grant',
            error_description: 'Bad Request: code=secret-code redirect_uri mismatch',
          };
        },
      }),
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientId: 'desktop-client.apps.googleusercontent.com',
      redirectUri: 'http://127.0.0.1:49210/oauth/google/callback',
      code: 'secret-code',
      verifier: 'verifier-secret',
    }),
    (error: any) => {
      assert.match(error.message, /Gmail OAuth token exchange failed/);
      assert.match(error.message, /invalid_grant/);
      assert.match(error.message, /redirect_uri/);
      assert.match(error.message, /redacted/);
      assert.equal(error.message.includes('secret-code'), false);
      return true;
    },
  );
});

test('exchangeAuthorizationCode explains missing client_secret configuration without leaking secrets', async () => {
  await assert.rejects(
    (exchangeAuthorizationCode as any)({
      fetchImpl: async () => ({
        ok: false,
        status: 400,
        async json() {
          return {
            error: 'invalid_request',
            error_description: 'client_secret is missing.',
          };
        },
      }),
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientId: 'web-client.apps.googleusercontent.com',
      redirectUri: 'http://127.0.0.1:49210/oauth/google/callback',
      code: 'secret-code',
      verifier: 'verifier-secret',
    }),
    (error: any) => {
      assert.match(error.message, /invalid_request/);
      assert.match(error.message, /client_secret is missing/);
      assert.match(error.message, /KEPT_GMAIL_CLIENT_SECRET/);
      assert.equal(error.message.includes('secret-code'), false);
      return true;
    },
  );
});

test('createConnector returns Gmail API connector backed by Tauri keychain adapter', async () => {
  const bridge = createTauriGmailBridge({
    mailCore: makeMailCore() as any,
    invoke: async (command, payload) => {
      if (command === 'gmail_oauth_config') return { tokenUrl: 'https://oauth2.googleapis.com/token', clientId: 'desktop-client.apps.googleusercontent.com' };
      if (command === 'gmail_keychain_get') {
        assert.equal(payload.account, accountId);
        return JSON.stringify({ access_token: 'stored-access', token_type: 'Bearer' });
      }
      throw new Error(`unexpected command ${command}`);
    },
    fetchImpl: async () => ({ ok: true, async json() { return {}; } } as unknown as Response),
  });

  const connector = await bridge.createConnector({ accountId });
  assert.equal(connector.provider, 'gmail');
  assert.equal(connector.accountId, accountId);
  assert.deepEqual(await connector.tokenStore.loadTokens(accountId), { access_token: 'stored-access', token_type: 'Bearer' });
});

test('desktop shell loads bridge before main and exposes Tauri globals for packaged app', async () => {
  const [indexHtml, tauriConfigText, rustMain] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
    readFile(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8'),
  ]);
  assert.ok(indexHtml.indexOf('./src/tauri-gmail-bridge.ts') > -1);
  assert.ok(indexHtml.indexOf('./src/tauri-gmail-bridge.ts') < indexHtml.indexOf('./src/main.ts'));
  const tauriConfig = JSON.parse(tauriConfigText);
  assert.equal(tauriConfig.app.withGlobalTauri, true);
  assert.match(tauriConfig.app.security.csp, /https:\/\/oauth2\.googleapis\.com/);
  assert.match(tauriConfig.app.security.csp, /https:\/\/gmail\.googleapis\.com/);
  assert.match(rustMain, /option_env!\("KEPT_GMAIL_CLIENT_ID"\)/);
  assert.match(rustMain, /option_env!\("GMAIL_CLIENT_ID"\)/);
  assert.match(rustMain, /option_env!\("KEPT_GMAIL_CLIENT_SECRET"\)/);
  assert.match(rustMain, /option_env!\("GMAIL_CLIENT_SECRET"\)/);
  assert.match(rustMain, /770442354658-ju4vt9tuurrq4a4r936b4ef08l36nati\.apps\.googleusercontent\.com/);
  for (const command of ['gmail_oauth_config', 'gmail_start_oauth', 'gmail_keychain_set', 'gmail_keychain_get', 'gmail_keychain_delete', 'gmail_send_reply']) {
    assert.match(rustMain, new RegExp(command));
  }
});

test('redaction removes token, authorization code, verifier, snippets, and body details from bridge errors', () => {
  const error = new Error('access_token=access-secret code=auth-code-secret code_verifier=verifier-secret snippet=hello body=private refresh_token=refresh-secret');
  const redacted = redactBridgeError(error);
  assert.equal(redacted.includes('access-secret'), false);
  assert.equal(redacted.includes('auth-code-secret'), false);
  assert.equal(redacted.includes('private'), false);
  assert.match(redacted, /\[redacted\]/);
});

test('invokeGmailSend calls gmail_send_reply with correct command and args', async () => {
  const calls: { command: string; payload: Record<string, unknown> }[] = [];
  const mockInvoke = async (command: string, payload?: Record<string, unknown>) => {
    calls.push({ command, payload: payload ?? {} });
    if (command === 'gmail_send_reply') return undefined;
    throw new Error(`unexpected command ${command}`);
  };

  await invokeGmailSend(mockInvoke, 'thread-xyz', 'Hello there', 'recipient@example.com', 'Re: Meeting');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'gmail_send_reply');
  assert.deepEqual(calls[0].payload, {
    threadId: 'thread-xyz',
    messageBody: 'Hello there',
    to: 'recipient@example.com',
    subject: 'Re: Meeting',
  });
});

test('invokeGmailSend rejects with redacted error string on failure', async () => {
  const mockInvoke = async (_command: string) => {
    throw new Error('access_token=secret-token internal error');
  };

  await assert.rejects(
    invokeGmailSend(mockInvoke, 't1', 'body', 'a@b.com', 'Hi'),
    (error: any) => {
      assert.match(error.message, /internal error/);
      assert.equal(error.message.includes('secret-token'), false, 'should redact token');
      return true;
    },
  );
});
