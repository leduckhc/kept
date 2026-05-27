import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createBridgeAvailabilityProbe,
  createTauriGmailBridge,
  exchangeAuthorizationCode,
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
  assert.equal(createBridgeAvailabilityProbe({}).available, false);
  assert.equal(createBridgeAvailabilityProbe({ __TAURI__: { core: { invoke() {} } } }).available, true);
});

test('startOAuth uses readonly OAuth config, loopback callback parsing, and keychain token persistence', async () => {
  const invocations = [];
  const keychain = new Map();
  const savedTokens = [];
  const bridge = createTauriGmailBridge({
    mailCore: makeMailCore({ savedTokens }),
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
    fetchImpl: async (url, options) => {
      assert.equal(String(url), 'https://oauth2.googleapis.com/token');
      assert.equal(options.method, 'POST');
      const body = new URLSearchParams(options.body);
      assert.equal(body.get('grant_type'), 'authorization_code');
      assert.equal(body.get('client_id'), 'desktop-client.apps.googleusercontent.com');
      assert.equal(body.get('redirect_uri'), 'http://127.0.0.1:49210/oauth/google/callback');
      assert.equal(body.get('code'), 'real-auth-code');
      assert.equal(body.get('code_verifier'), 'verifier-secret');
      return { ok: true, async json() { return { access_token: 'access-value', refresh_token: 'refresh-value', expires_in: 3600, token_type: 'Bearer' }; } };
    },
  });

  const result = await bridge.startOAuth({ accountId });
  assert.deepEqual(result, { accountId, stored: 'keychain' });
  assert.equal(savedTokens.length, 1);
  assert.equal(savedTokens[0].accountId, accountId);
  assert.deepEqual(savedTokens[0].tokens, {
    accessToken: 'access-value',
    refreshToken: 'refresh-value',
    expiresAt: 3600,
    tokenType: 'Bearer',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
  });
  assert.deepEqual(invocations.map((entry) => entry.command), [
    'gmail_oauth_config',
    'gmail_start_oauth',
    'gmail_keychain_set',
  ]);
});

test('exchangeAuthorizationCode normalizes Google snake_case tokens for the mail-core keychain store', async () => {
  const tokens = await exchangeAuthorizationCode({
    fetchImpl: async (_url, _options) => ({
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

  assert.deepEqual(tokens, {
    accessToken: 'access-value',
    refreshToken: 'refresh-value',
    expiresAt: 3600,
    tokenType: 'Bearer',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
  });
});

test('createConnector returns Gmail API connector backed by Tauri keychain adapter', async () => {
  const bridge = createTauriGmailBridge({
    mailCore: makeMailCore(),
    invoke: async (command, payload) => {
      if (command === 'gmail_keychain_get') {
        assert.equal(payload.account, accountId);
        return JSON.stringify({ access_token: 'stored-access', token_type: 'Bearer' });
      }
      throw new Error(`unexpected command ${command}`);
    },
    fetchImpl: async () => ({ ok: true, async json() { return {}; } }),
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
  assert.ok(indexHtml.indexOf('./src/tauri-gmail-bridge.js') > -1);
  assert.ok(indexHtml.indexOf('./src/tauri-gmail-bridge.js') < indexHtml.indexOf('./src/main.js'));
  const tauriConfig = JSON.parse(tauriConfigText);
  assert.equal(tauriConfig.app.withGlobalTauri, true);
  assert.match(tauriConfig.app.security.csp, /https:\/\/oauth2\.googleapis\.com/);
  assert.match(tauriConfig.app.security.csp, /https:\/\/gmail\.googleapis\.com/);
  assert.match(rustMain, /option_env!\("KEPT_GMAIL_CLIENT_ID"\)/);
  assert.match(rustMain, /option_env!\("GMAIL_CLIENT_ID"\)/);
  for (const command of ['gmail_oauth_config', 'gmail_start_oauth', 'gmail_keychain_set', 'gmail_keychain_get', 'gmail_keychain_delete']) {
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
