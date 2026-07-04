/**
 * Cloud lyrics generator — fetches word-level (YRC) lyrics for NetEase BGM
 * sources configured in config/site.yaml and writes them to
 * public/music/cloud-lyrics/ plus an index.json consumed at runtime by
 * src/lib/cloud-lyrics.ts (which also provides the shared fingerprint helpers).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { buildCloudLyricsSourceKey, type CloudLyricsIndexEntry, getLyricFingerprint } from '../../lib/cloud-lyrics';
import type { BgmAudioGroup } from '../../lib/config/types';
import { parseMusicUrl } from '../../lib/meting';
import { ensureDirectory, isErrnoException, naturalCompare, readJsonFileIfExists, writeJsonFile } from './manifest-utils';
import { fetchNeteaseSongsByType, fetchNeteaseWordLrc, type NeteaseSong } from './netease-api';
import { readBgmAudioGroups } from './site-config';

const CLOUD_LYRICS_BASE_DIR = 'public/music/cloud-lyrics';
const CLOUD_LYRICS_INDEX_PATH = 'public/music/cloud-lyrics/index.json';
const CLOUD_LYRICS_SCHEMA = 1;
const CLOUD_LYRICS_CONCURRENCY = 4;
/** Skip regeneration while the index is younger than this and sources are unchanged. */
const CLOUD_LYRICS_REFRESH_TTL_MS = 24 * 60 * 60 * 1000;

type CloudLyricsServer = 'netease';

interface CloudLyricsSource {
  server: CloudLyricsServer;
  type: string;
  id: string;
  url: string;
  sourceKey: string;
}

interface CloudLyricsSong {
  server: CloudLyricsServer;
  type: string;
  sourceId: string;
  sourceKey: string;
  songId: string;
  name: string;
  artist: string;
  duration?: number;
}

/** Full generated entry — a superset of the runtime's CloudLyricsIndexEntry. */
interface CloudLyricsEntry extends CloudLyricsSong, CloudLyricsIndexEntry {}

interface CloudLyricsIndex {
  schema: number;
  generatedAt: string;
  /** Source set the index was generated from — regenerate when config changes. */
  sourceKeys?: string[];
  entries: CloudLyricsEntry[];
}

interface CloudLyricsGenerationResult {
  entry: CloudLyricsEntry;
  reused: boolean;
}

function isSupportedCloudLyricsServer(server: string): server is CloudLyricsServer {
  return server === 'netease';
}

function getCloudLyricsSources(groups: BgmAudioGroup[]): CloudLyricsSource[] {
  const sources = new Map<string, CloudLyricsSource>();

  for (const group of groups) {
    for (const url of group.list) {
      const parsed = parseMusicUrl(url);
      if (!parsed) continue;

      const server = parsed.server;
      if (!isSupportedCloudLyricsServer(server)) continue;

      const sourceKey = buildCloudLyricsSourceKey(parsed.server, parsed.type, parsed.id);
      if (!sources.has(sourceKey)) {
        sources.set(sourceKey, { server, type: parsed.type, id: parsed.id, url, sourceKey });
      }
    }
  }

  return Array.from(sources.values());
}

function toSafeFilenamePart(value: string): string {
  return value.replace(/[^\w-]/g, '_');
}

function toCloudLyricsSongFromNetease(source: CloudLyricsSource, song: NeteaseSong): CloudLyricsSong | null {
  const songId = song.id === undefined ? '' : String(song.id);
  const name = song.name?.trim() ?? '';
  if (!songId || !name) return null;

  const artists = song.ar ?? song.artists ?? [];
  const artist = artists
    .map((item) => item.name?.trim())
    .filter((value): value is string => Boolean(value))
    .join(' / ');
  const durationMs = song.dt ?? song.duration;

  return {
    server: 'netease',
    type: source.type,
    sourceId: source.id,
    sourceKey: source.sourceKey,
    songId,
    name,
    artist,
    ...(typeof durationMs === 'number' && durationMs > 0 && { duration: durationMs / 1000 }),
  };
}

async function fetchCloudSongs(source: CloudLyricsSource): Promise<CloudLyricsSong[]> {
  const songs = await fetchNeteaseSongsByType(source.type, source.id);
  return songs
    .map((song) => toCloudLyricsSongFromNetease(source, song))
    .filter((song): song is CloudLyricsSong => song !== null);
}

function buildCloudLyricsEntry(song: CloudLyricsSong, lrcUrl: string): CloudLyricsEntry {
  return {
    ...song,
    lrc: lrcUrl,
    fingerprint: getLyricFingerprint(song.name, song.artist),
    quality: 'word',
  };
}

async function generateCloudLyricsForSong(song: CloudLyricsSong, force: boolean): Promise<CloudLyricsGenerationResult | null> {
  const lyricDir = path.join(CLOUD_LYRICS_BASE_DIR, song.server);
  await ensureDirectory(lyricDir);

  const filename = `${toSafeFilenamePart(song.songId)}.lrc`;
  const lyricPath = path.join(lyricDir, filename);
  const lrcUrl = `/music/cloud-lyrics/${song.server}/${filename}`;

  if (!force) {
    try {
      const existing = await fs.readFile(lyricPath, 'utf8');
      if (existing.trim()) return { entry: buildCloudLyricsEntry(song, lrcUrl), reused: true };
    } catch (error) {
      if (!isErrnoException(error, 'ENOENT')) throw error;
    }
  }

  const lyric = await fetchNeteaseWordLrc(song.songId);
  if (!lyric.trim()) return null;

  await fs.writeFile(lyricPath, `${lyric.trim()}\n`, 'utf8');
  return { entry: buildCloudLyricsEntry(song, lrcUrl), reused: false };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function readBgmAudioGroupsSafe(): Promise<BgmAudioGroup[]> {
  try {
    return await readBgmAudioGroups();
  } catch (error) {
    console.log(chalk.yellow('  Failed to read BGM config. Skipping cloud lyrics.'));
    console.log(chalk.dim(`  ${error instanceof Error ? error.message : String(error)}`));
    return [];
  }
}

function isIndexFresh(index: CloudLyricsIndex | null, sourceKeys: string[]): boolean {
  if (!index?.generatedAt || !Array.isArray(index.sourceKeys)) return false;

  const age = Date.now() - new Date(index.generatedAt).getTime();
  if (!Number.isFinite(age) || age < 0 || age > CLOUD_LYRICS_REFRESH_TTL_MS) return false;

  const previousKeys = new Set(index.sourceKeys);
  return sourceKeys.length === previousKeys.size && sourceKeys.every((key) => previousKeys.has(key));
}

export async function runCloudLyricsGenerator(force: boolean): Promise<void> {
  console.log(chalk.blue.bold('\n=== Cloud Lyrics Generator ===\n'));

  const audioGroups = await readBgmAudioGroupsSafe();
  const sources = getCloudLyricsSources(audioGroups);
  if (sources.length === 0) {
    console.log(chalk.dim('  No supported NetEase cloud BGM sources found. Skipping cloud lyrics.'));
    return;
  }

  const sourceKeys = sources.map((source) => source.sourceKey);
  const existingIndex = await readJsonFileIfExists<CloudLyricsIndex>(CLOUD_LYRICS_INDEX_PATH);
  if (!force && isIndexFresh(existingIndex, sourceKeys)) {
    console.log(chalk.dim('  Cloud lyrics index is fresh (< 24h, sources unchanged). Skipping (--force to refresh).'));
    return;
  }

  const entries: CloudLyricsEntry[] = [];
  const failedSourceKeys = new Set<string>();
  const seenSongKeys = new Set<string>();
  let generated = 0;
  let skipped = 0;
  let noWordLyrics = 0;
  let failed = 0;

  await ensureDirectory(CLOUD_LYRICS_BASE_DIR);

  for (const source of sources) {
    try {
      const songs = await fetchCloudSongs(source);
      console.log(chalk.green(`  Found ${songs.length} cloud song(s) from ${source.sourceKey}`));

      const uniqueSongs = songs.filter((song) => {
        const songKey = `${song.server}:${song.songId}`;
        if (seenSongKeys.has(songKey)) return false;
        seenSongKeys.add(songKey);
        return true;
      });

      const sourceEntries = await mapWithConcurrency(uniqueSongs, CLOUD_LYRICS_CONCURRENCY, async (song) => {
        try {
          const result = await generateCloudLyricsForSong(song, force);
          if (!result) {
            noWordLyrics++;
            return null;
          }

          if (result.reused) skipped++;
          else generated++;
          return result.entry;
        } catch (error) {
          failed++;
          console.log(chalk.red(`  Failed to generate lyric for ${song.name} - ${song.artist}`));
          console.log(chalk.dim(`  ${error instanceof Error ? error.message : String(error)}`));
          return null;
        }
      });

      entries.push(...sourceEntries.filter((entry): entry is CloudLyricsEntry => entry !== null));
    } catch (error) {
      failedSourceKeys.add(source.sourceKey);
      failed++;
      console.log(chalk.red(`  Failed to load cloud source ${source.sourceKey}`));
      console.log(chalk.dim(`  ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  if (existingIndex?.entries && failedSourceKeys.size > 0) {
    const existingSongKeys = new Set(entries.map((entry) => `${entry.server}:${entry.songId}`));
    const fallbackEntries = existingIndex.entries.filter((entry) => {
      const songKey = `${entry.server}:${entry.songId}`;
      return failedSourceKeys.has(entry.sourceKey) && !existingSongKeys.has(songKey);
    });
    entries.push(...fallbackEntries);
  }

  entries.sort((a, b) => naturalCompare(`${a.server}:${a.name}:${a.artist}`, `${b.server}:${b.name}:${b.artist}`));
  await writeJsonFile(CLOUD_LYRICS_INDEX_PATH, {
    schema: CLOUD_LYRICS_SCHEMA,
    generatedAt: new Date().toISOString(),
    sourceKeys,
    entries,
  } satisfies CloudLyricsIndex);

  console.log(chalk.blue.bold('\n=== Cloud Lyrics Summary ==='));
  console.log(chalk.green(`  Indexed: ${entries.length}`));
  console.log(chalk.green(`  Generated: ${generated}`));
  console.log(chalk.dim(`  Reused: ${skipped}`));
  console.log(chalk.dim(`  No word lyrics: ${noWordLyrics}`));
  if (failed > 0) console.log(chalk.red(`  Failed: ${failed}`));
}
