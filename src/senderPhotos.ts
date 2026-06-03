// senderPhotos.ts — Resolve sender profile photos via Google People API + Gravatar fallback
// Photos are cached in SQLite (sender_photos table) for 7 days.

import { type Account, ensureFreshToken } from './auth';
import { getDb } from './db';

// Tauri HTTP plugin loaded lazily
let _fetch: typeof globalThis.fetch | null = null;
async function getFetch(): Promise<typeof globalThis.fetch> {
  if (!_fetch) {
    if ('__TAURI_INTERNALS__' in window) {
      const mod = await import('@tauri-apps/plugin-http');
      _fetch = mod.fetch as unknown as typeof globalThis.fetch;
    } else {
      _fetch = globalThis.fetch.bind(globalThis);
    }
  }
  return _fetch;
}

const PEOPLE_API = 'https://people.googleapis.com/v1';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const NEGATIVE_CACHE_URL = '__none__'; // Sentinel for "no photo found"

// In-memory LRU to avoid repeated DB hits within a session
const memCache = new Map<string, string | null>(); // email → url or null

/** Get cached photo URL for an email (sync, from memory only). Returns null if not cached. */
export function getCachedPhotoUrl(email: string): string | null {
  const cached = memCache.get(email.toLowerCase());
  return cached === NEGATIVE_CACHE_URL ? null : (cached ?? null);
}

/** Check if we have a cached result (including negative cache). */
export function hasCachedResult(email: string): boolean {
  return memCache.has(email.toLowerCase());
}

/** Load all cached photos from DB into memory (call on startup). */
export async function loadPhotoCache(): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const rows = await db.select<Array<{ email: string; photo_url: string; fetched_at: number }>>(
    'SELECT email, photo_url, fetched_at FROM sender_photos'
  );
  for (const row of rows) {
    if (now - row.fetched_at < CACHE_TTL_MS) {
      memCache.set(row.email, row.photo_url);
    }
  }
}

/** Resolve photos for a batch of emails via People API otherContacts.search.
 *  Returns a map of email → photo URL for those found. */
export async function resolvePhotos(emails: string[], account: Account): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const toResolve = emails
    .map(e => e.toLowerCase())
    .filter(e => !memCache.has(e)); // Skip already cached (positive or negative)

  if (toResolve.length === 0) return results;

  await ensureFreshToken(account);
  const f = await getFetch();

  // People API: otherContacts.search — search by email, one at a time (no batch endpoint for search)
  // We batch up to 5 concurrent requests to stay under rate limits
  const CONCURRENCY = 5;
  for (let i = 0; i < toResolve.length; i += CONCURRENCY) {
    const batch = toResolve.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (email) => {
      try {
        const params = new URLSearchParams({
          query: email,
          readMask: 'photos,emailAddresses',
          pageSize: '1',
        });
        const res = await f(`${PEOPLE_API}/otherContacts:search?${params}`, {
          headers: { Authorization: `Bearer ${account.accessToken}` },
        });
        if (!res.ok) return { email, photoUrl: null };
        const data = await res.json() as {
          results?: Array<{
            person?: {
              photos?: Array<{ url?: string; default?: boolean }>;
              emailAddresses?: Array<{ value?: string }>;
            };
          }>;
        };
        // Find a non-default photo (default = silhouette placeholder)
        const person = data.results?.[0]?.person;
        if (!person?.photos) return { email, photoUrl: null };
        const photo = person.photos.find(p => !p.default && p.url);
        return { email, photoUrl: photo?.url ?? null };
      } catch {
        return { email, photoUrl: null };
      }
    });
    const settled = await Promise.all(promises);
    for (const { email, photoUrl } of settled) {
      if (photoUrl) {
        results.set(email, photoUrl);
        memCache.set(email, photoUrl);
      } else {
        memCache.set(email, NEGATIVE_CACHE_URL);
      }
    }
  }

  // Persist to DB
  const db = await getDb();
  const now = Date.now();
  for (const email of toResolve) {
    const url = memCache.get(email) ?? NEGATIVE_CACHE_URL;
    await db.execute(
      'INSERT OR REPLACE INTO sender_photos (email, photo_url, fetched_at) VALUES (?, ?, ?)',
      [email, url, now]
    ).catch(() => {});
  }

  return results;
}

/** Resolve a single email's photo (returns URL or null). Uses cache first. */
export async function resolvePhoto(email: string, account: Account): Promise<string | null> {
  const lower = email.toLowerCase();
  if (memCache.has(lower)) {
    const v = memCache.get(lower)!;
    return v === NEGATIVE_CACHE_URL ? null : v;
  }
  const map = await resolvePhotos([email], account);
  return map.get(lower) ?? null;
}
