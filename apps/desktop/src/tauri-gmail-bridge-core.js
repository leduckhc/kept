const DEFAULT_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_ACCOUNT_ID = 'acct_local_gmail';
const KEYCHAIN_SERVICE = 'kept.gmail.oauth';

export function createBridgeAvailabilityProbe(globalObject = globalThis) {
  const invoke = globalObject?.__TAURI__?.core?.invoke;
  return { available: typeof invoke === 'function', invoke };
}

export function createTauriGmailBridge({
  mailCore,
  invoke,
  fetchImpl = globalThis.fetch,
  randomState = createRandomState,
} = {}) {
  if (!mailCore) throw new Error('mailCore is required for Gmail bridge');
  if (typeof invoke !== 'function') throw new Error('Tauri invoke is required for Gmail bridge');
  if (typeof fetchImpl !== 'function') throw new Error('fetch is required for Gmail bridge');

  const keychain = createTauriKeychainAdapter({ invoke });
  const tokenStore = mailCore.createKeychainTokenStore({ keychain, service: KEYCHAIN_SERVICE });

  async function startOAuth({ accountId = DEFAULT_ACCOUNT_ID } = {}) {
    try {
      const config = await invoke('gmail_oauth_config');
      if (!config?.enabled || !config.clientId) {
        throw new Error('Gmail OAuth is not configured on this desktop build.');
      }
      const redirectUri = config.redirectUri;
      const tokenUrl = config.tokenUrl || DEFAULT_TOKEN_URL;
      const state = randomState();
      const pkce = await mailCore.createPkcePair();
      const authUrl = mailCore.createGmailOAuthUrl({
        clientId: config.clientId,
        redirectUri,
        state,
        codeChallenge: pkce.challenge,
      });
      const callbackUrl = await invoke('gmail_start_oauth', {
        authUrl: String(authUrl),
        redirectUri,
        timeoutMs: config.callbackTimeoutMs || 120000,
      });
      const parsed = mailCore.parseGmailOAuthCallback(callbackUrl, { expectedState: state });
      if (!parsed.ok) throw new Error('Gmail authorization was cancelled.');
      const tokens = await exchangeAuthorizationCode({
        fetchImpl,
        tokenUrl,
        clientId: config.clientId,
        redirectUri,
        code: parsed.code,
        verifier: pkce.verifier,
      });
      await tokenStore.saveTokens(accountId, tokens);
      return { accountId, stored: 'keychain' };
    } catch (error) {
      throw new Error(redactBridgeError(error));
    }
  }

  async function createConnector({ accountId = DEFAULT_ACCOUNT_ID } = {}) {
    return mailCore.createGmailApiConnector({ tokenStore, fetchImpl, accountId });
  }

  return { startOAuth, createConnector };
}

export function createTauriKeychainAdapter({ invoke }) {
  return {
    async setPassword(service, account, secret) {
      await invoke('gmail_keychain_set', { service, account, secret });
    },
    async getPassword(service, account) {
      return invoke('gmail_keychain_get', { service, account });
    },
    async deletePassword(service, account) {
      await invoke('gmail_keychain_delete', { service, account });
    },
  };
}

export async function exchangeAuthorizationCode({ fetchImpl, tokenUrl, clientId, redirectUri, code, verifier }) {
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('client_id', clientId);
  body.set('redirect_uri', redirectUri);
  body.set('code', code);
  body.set('code_verifier', verifier);
  const response = await fetchImpl(tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new Error('Gmail OAuth token exchange failed.');
  return normalizeGoogleOAuthTokens(await response.json());
}

function normalizeGoogleOAuthTokens(tokens) {
  return {
    accessToken: tokens.access_token || tokens.accessToken,
    refreshToken: tokens.refresh_token || tokens.refreshToken || null,
    expiresAt: tokens.expires_in || tokens.expiresAt || null,
    tokenType: tokens.token_type || tokens.tokenType || 'Bearer',
    scope: tokens.scope || 'https://www.googleapis.com/auth/gmail.readonly',
  };
}

export function redactBridgeError(error) {
  return String(error?.message || error || 'Gmail bridge failed')
    .replace(/(access_token|refresh_token|id_token|code|code_verifier|client_secret|snippet|body)=([^\s&]+)/gi, '$1=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/ya29\.[A-Za-z0-9._~-]+/g, '[redacted]');
}

function createRandomState() {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
