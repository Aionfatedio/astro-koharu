/**
 * Cloud lyrics — runtime loader for build-time generated word-level lyrics.
 *
 * The index at /music/cloud-lyrics/index.json is produced by
 * src/scripts/lib/cloud-lyrics-generator.ts; fingerprint/sourceKey helpers and
 * the index entry shape are shared with that generator via this module.
 */

import { type MetingSong, parseMusicUrl } from './meting';

/** Minimal entry shape the runtime needs; the generator writes a superset. */
export interface CloudLyricsIndexEntry {
  sourceKey: string;
  name: string;
  artist: string;
  lrc: string;
  fingerprint: string;
  quality: 'word';
}

export interface CloudLyricsIndex {
  schema: number;
  entries?: CloudLyricsIndexEntry[];
}

let cloudLyricsIndexPromise: Promise<CloudLyricsIndex | null> | null = null;

function normalizeLyricFingerprintPart(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-＿_.,，。:：;；'"“”‘’`~!！?？/\\|()[\]{}【】《》<>〈〉（）·・•]/g, '');
}

/** Match a Meting track to a generated lyric by normalized name+artist. */
export function getLyricFingerprint(name: string, artist: string): string {
  return `${normalizeLyricFingerprintPart(name)}::${normalizeLyricFingerprintPart(artist)}`;
}

/** Canonical source identity shared between the generator (write) and runtime (read). */
export function buildCloudLyricsSourceKey(server: string, type: string, id: string): string {
  return `${server}:${type}:${id}`;
}

function isLocalMusicTrack(track: MetingSong): boolean {
  return track.url.startsWith('/music/');
}

export function getCloudLyricsSourceKey(url: string): string | null {
  const parsed = parseMusicUrl(url);
  if (!parsed || parsed.server !== 'netease') return null;
  return buildCloudLyricsSourceKey(parsed.server, parsed.type, parsed.id);
}

export async function loadCloudLyricsIndex(): Promise<CloudLyricsIndex | null> {
  cloudLyricsIndexPromise ??= fetch('/music/cloud-lyrics/index.json')
    .then((response) => {
      if (!response.ok) return null;
      return response.json() as Promise<CloudLyricsIndex>;
    })
    .catch(() => null);

  return cloudLyricsIndexPromise;
}

export function applyCloudLyrics(
  tracks: MetingSong[],
  index: CloudLyricsIndex | null,
  sourceKey?: string | null,
): MetingSong[] {
  if (!sourceKey || !index?.entries?.length) return tracks;

  const lyricsByFingerprint = new Map<string, CloudLyricsIndexEntry>();
  for (const entry of index.entries) {
    if (entry.sourceKey !== sourceKey) continue;
    if (!entry.lrc || entry.quality !== 'word') continue;
    if (!lyricsByFingerprint.has(entry.fingerprint)) {
      lyricsByFingerprint.set(entry.fingerprint, entry);
    }
  }

  return tracks.map((track) => {
    if (isLocalMusicTrack(track)) return track;

    const entry = lyricsByFingerprint.get(getLyricFingerprint(track.name, track.artist));
    if (!entry || track.lrc === entry.lrc) return track;

    return {
      ...track,
      lrc: entry.lrc,
    };
  });
}
