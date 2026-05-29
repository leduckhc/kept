import {
  createGmailApiConnector,
  createGmailOAuthUrl,
  createKeychainTokenStore,
  createPkcePair,
  parseGmailOAuthCallback,
} from '/packages/mail-core/dist/index.js';
import { createBridgeAvailabilityProbe, createTauriGmailBridge } from './tauri-gmail-bridge-core.js';

const probe = createBridgeAvailabilityProbe(window);

if (probe.available) {
  (window as Window & typeof globalThis & { __KEPT_GMAIL_CONNECT__: unknown }).__KEPT_GMAIL_CONNECT__ = createTauriGmailBridge({
    invoke: probe.invoke,
    fetchImpl: window.fetch.bind(window),
    mailCore: {
      createGmailApiConnector,
      createGmailOAuthUrl,
      createKeychainTokenStore,
      createPkcePair,
      parseGmailOAuthCallback,
    },
  });
}
