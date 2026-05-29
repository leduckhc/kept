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
      if (!parsed.ok) throw new Error('Gmail authorization was cancelled before Kept received an authorization code.');
      let tokens;
      try {
        tokens = await exchangeAuthorizationCode({
          fetchImpl,
          tokenUrl,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          redirectUri,
          code: parsed.code,
          verifier: pkce.verifier,
        });
      } catch (error) {
        const detail = redactBridgeError(error);
        if (/client_secret is missing/i.test(detail)) {
          throw new Error(`Gmail sign-in reached Kept, but Google rejected the token exchange: ${detail}. ${oauthConfigHint(config)}`);
        }
        throw new Error(`Gmail sign-in reached Kept, but Google rejected the token exchange: ${detail}`);
      }
      try {
        await tokenStore.saveTokens(accountId, tokens);
      } catch (error) {
        throw new Error(`Gmail sign-in reached Kept, but Kept could not save tokens to the OS keychain: ${redactBridgeError(error)}`);
      }
      return { accountId, stored: 'keychain' };
    } catch (error) {
      throw new Error(redactBridgeError(error));
    }
  }

  async function createConnector({ accountId = DEFAULT_ACCOUNT_ID } = {}) {
    const config = await invoke('gmail_oauth_config').catch(() => ({}));
    return mailCore.createGmailApiConnector({
      tokenStore,
      fetchImpl,
      accountId,
      tokenUrl: config?.tokenUrl || DEFAULT_TOKEN_URL,
      clientId: config?.clientId || '',
      clientSecret: config?.clientSecret || '',
    });
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

export async function exchangeAuthorizationCode({ fetchImpl, tokenUrl, clientId, clientSecret, redirectUri, code, verifier }) {
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('client_id', clientId);
  if (clientSecret) body.set('client_secret', clientSecret);
  body.set('redirect_uri', redirectUri);
  body.set('code', code);
  body.set('code_verifier', verifier);
  const response = await fetchImpl(tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await parseTokenResponsePayload(response);
  if (!response.ok) throw new Error(formatGoogleTokenError(payload, response.status));
  return normalizeGoogleOAuthTokens(payload);
}

async function parseTokenResponsePayload(response) {
  try {
    return await response.json();
  } catch (_error) {
    return {};
  }
}

function formatGoogleTokenError(payload = {}, status) {
  const code = safeGoogleErrorField(payload.error) || `http_${status || 'error'}`;
  const description = safeGoogleErrorField(payload.error_description);
  const hint = tokenExchangeHint(code, description);
  return ['Gmail OAuth token exchange failed', code, description, hint].filter(Boolean).join(': ');
}

function safeGoogleErrorField(value) {
  return String(value || '')
    .replace(/(access_token|refresh_token|id_token|code|code_verifier|client_secret)=([^\s&]+)/gi, '$1=[redacted]')
    .replace(/[^\p{L}\p{N}\s._:/@+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function tokenExchangeHint(code, description) {
  const message = `${code} ${description}`.toLowerCase();
  if (message.includes('redirect_uri')) return 'Check that the OAuth Desktop client allows the exact loopback redirect URI shown in Kept.';
  if (message.includes('invalid_grant')) return 'The browser callback reached Kept, but Google rejected the one-time authorization code. Retry once; if it repeats, the client ID and redirect configuration do not match.';
  if (message.includes('client_secret')) return 'The packaged OAuth client is configured as a Google Web client. Add KEPT_GMAIL_CLIENT_SECRET to the release build or switch KEPT_GMAIL_CLIENT_ID to an OAuth Desktop client.';
  if (message.includes('invalid_client')) return 'The packaged Kept OAuth client ID is not valid for this Google Cloud project/client type.';
  if (message.includes('access_denied') || message.includes('verification')) return 'Keep the Google Auth Platform publishing status in Testing and add this exact Google account as a test user for the project that owns the packaged client ID.';
  return '';
}

function oauthConfigHint(config = {}) {
  const clientId = String(config?.clientId || '');
  const clientIdTail = clientId ? clientId.slice(-8) : 'missing';
  const clientSecretPresent = Boolean(String(config?.clientSecret || '').trim());
  return `Kept build diagnostics: clientSecretPresent=${clientSecretPresent}; clientIdTail=${clientIdTail}. If false, KEPT_GMAIL_CLIENT_SECRET is not reaching this packaged app build.`;
}

function normalizeGoogleOAuthTokens(tokens, { now = () => new Date() } = {}) {
  const expiresAt = tokens.expiresAt || (tokens.expires_in ? new Date(now().getTime() + Number(tokens.expires_in) * 1000).toISOString() : null);
  return {
    accessToken: tokens.access_token || tokens.accessToken,
    refreshToken: tokens.refresh_token || tokens.refreshToken || null,
    expiresAt,
    tokenType: tokens.token_type || tokens.tokenType || 'Bearer',
    scope: tokens.scope || 'https://www.googleapis.com/auth/gmail.readonly',
  };
}

export async function invokeGmailSend(
  invoke: (command: string, payload?: Record<string, unknown>) => Promise<unknown>,
  threadId: string,
  body: string,
  to: string,
  subject: string,
): Promise<void> {
  try {
    await invoke('gmail_send_reply', { threadId, messageBody: body, to, subject });
  } catch (error) {
    throw new Error(redactBridgeError(error));
  }
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
