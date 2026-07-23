/**
 * Meting API client — resolves music platform URLs to playable audio streams.
 *
 * Ported from Shoka player.js URL parsing + Meting API integration.
 * Supports NetEase Cloud Music, QQ Music, and local music playlists.
 */

const DEFAULT_API = 'https://163.hyc.moe/';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_API_HOST = '163.hyc.moe';

export interface MetingSong {
  name: string;
  artist: string;
  url: string;
  pic: string;
  lrc: string;
}

interface ParsedUrl {
  server: string;
  type: string;
  id: string;
}

// URL parsing rules (ported from Shoka player.js:30-47)
const URL_RULES: [RegExp, string, string][] = [
  [/music\.163\.com.*song.*id=(\d+)/, 'netease', 'song'],
  [/music\.163\.com.*album.*id=(\d+)/, 'netease', 'albumlist'],
  [/music\.163\.com.*playlist.*id=(\d+)/, 'netease', 'playlist'],
  [/music\.163\.com.*discover\/toplist.*id=(\d+)/, 'netease', 'playlist'],
  [/y\.qq\.com.*song\/(\w+)/, 'tencent', 'song'],
  [/y\.qq\.com.*album\/(\w+)/, 'tencent', 'albumlist'],
  [/y\.qq\.com.*playsquare\/(\w+)/, 'tencent', 'playlist'],
  [/y\.qq\.com.*playlist\/(\w+)/, 'tencent', 'playlist'],
];

/** Parse a music platform URL into server/type/id triple. */
export function parseMusicUrl(url: string): ParsedUrl | null {
  for (const [regex, server, type] of URL_RULES) {
    const match = url.match(regex);
    if (match?.[1]) {
      return { server, type, id: match[1] };
    }
  }
  return null;
}

interface CacheEntry {
  data: MetingSong[];
  timestamp: number;
}

function getCacheKey(server: string, type: string, id: string): string {
  return `meting:${server}:${type}:${id}`;
}

/** Avoid CORS failures from the public Meting API's HTTP -> HTTPS redirect. */
export function normalizeMetingResourceUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' && url.hostname === DEFAULT_API_HOST) {
      url.protocol = 'https:';
      return url.toString();
    }

    if (/^https?:\/\//i.test(trimmed)) return trimmed;
  } catch {
    // Relative local paths and inline lyrics are valid for this app; leave them untouched.
  }

  return value;
}

function normalizeMetingSong(song: MetingSong): MetingSong {
  return {
    ...song,
    url: normalizeMetingResourceUrl(song.url),
    pic: song.pic ? normalizeMetingResourceUrl(song.pic) : '',
    lrc: song.lrc ? normalizeMetingResourceUrl(song.lrc) : '',
  };
}

function getFromCache(key: string): MetingSong[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    // Normalize on read (cheap) instead of writing back — a write here would
    // refresh `timestamp` and let stale CDN-signed URLs outlive the TTL forever.
    return entry.data.filter(isMetingSong).map(normalizeMetingSong);
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage failures; the cache is disposable.
    }
    return null;
  }
}

function purgeMetingCache(): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('meting:')) keys.push(key);
  }
  for (const key of keys) localStorage.removeItem(key);
}

function setCache(key: string, data: MetingSong[]): void {
  const raw = JSON.stringify({ data, timestamp: Date.now() } satisfies CacheEntry);
  try {
    localStorage.setItem(key, raw);
  } catch {
    // Quota exceeded — the cache is disposable, so evict all meting entries and retry once.
    try {
      purgeMetingCache();
      localStorage.setItem(key, raw);
    } catch {
      // localStorage unavailable — non-critical, skip silently
    }
  }
}

function isMetingSong(obj: unknown): obj is MetingSong {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return typeof o.name === 'string' && typeof o.artist === 'string' && typeof o.url === 'string';
}

/** Fetch songs from Meting API for a single parsed URL. */
async function fetchMeting(server: string, type: string, id: string, apiUrl?: string): Promise<MetingSong[]> {
  const cacheKey = getCacheKey(server, type, id);
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const url = new URL(normalizeMetingResourceUrl(apiUrl || DEFAULT_API));
  const params = new URLSearchParams({ server, type, id });
  url.search = params.toString();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Meting API error: ${response.status}`);

  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error('Meting API returned an invalid playlist.');
  const songs = data.filter(isMetingSong).map(normalizeMetingSong);
  if (songs.length > 0) setCache(cacheKey, songs);
  return songs;
}

// --------- Local Music Playlist Support ---------

/** Check if a URL is a local music playlist path (e.g. "/music/my-playlist") */
function isLocalMusicPath(url: string): boolean {
  return /^\/music\/[\w-]+\/?$/.test(url);
}

function isInvalidLocalMusicPath(url: string): boolean {
  return url.startsWith('/music/');
}

interface LocalManifest {
  tracks?: MetingSong[];
}

/** Fetch local playlist by loading its manifest.json */
async function fetchLocalPlaylist(basePath: string): Promise<MetingSong[]> {
  const normalizedPath = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  const manifestUrl = `${normalizedPath}/manifest.json`;

  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error(`Local playlist manifest failed: ${manifestUrl} (${response.status})`);

  const manifest: LocalManifest = await response.json();
  if (!Array.isArray(manifest.tracks)) throw new Error(`Invalid local playlist manifest: ${manifestUrl}`);
  return manifest.tracks.filter(isMetingSong).map(normalizeMetingSong);
}

/** Resolve multiple music URLs into a flat song list. */
export async function resolvePlaylist(urls: string[], apiUrl?: string): Promise<MetingSong[]> {
  const results = await Promise.allSettled(
    urls.map((url) => {
      // Local music playlist: /music/<playlist-name>
      if (isLocalMusicPath(url)) return fetchLocalPlaylist(url);
      if (isInvalidLocalMusicPath(url)) {
        console.warn(`[Meting] Invalid local music playlist path: ${url}`);
        return Promise.resolve([]);
      }

      // Network music platform URL
      const parsed = parseMusicUrl(url);
      if (!parsed) return Promise.resolve([]);
      return fetchMeting(parsed.server, parsed.type, parsed.id, apiUrl);
    }),
  );

  const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
  const tracks = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));

  if (failures.length > 0 && tracks.length === 0) {
    const reason = failures[0].reason;
    throw reason instanceof Error ? reason : new Error('Failed to resolve playlist.');
  }
  if (failures.length > 0) {
    console.warn(`[Meting] Skipped ${failures.length} playlist source(s) after resolution errors.`);
  }

  return tracks;
}
