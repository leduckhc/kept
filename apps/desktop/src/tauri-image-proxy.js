import { createBridgeAvailabilityProbe } from './tauri-gmail-bridge-core.js';

const probe = createBridgeAvailabilityProbe(window);

/**
 * Proxy a remote image URL through the local Tauri backend.
 * Returns a base64 data URI, or null if Tauri is unavailable.
 * Throws with a user-facing message on fetch failure.
 */
export async function proxyImage(url) {
  if (!probe.available) return null;
  return probe.invoke('fetch_image', { url });
}

export function isImageProxyAvailable() {
  return probe.available;
}
