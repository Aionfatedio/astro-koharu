/**
 * Generate manifests/metadata for local comics, music playlists, and videos.
 *
 * Usage:
 *   pnpm generate:media
 *   pnpm generate:media --force
 *   pnpm generate:media --target comics
 *   pnpm generate:media --target music
 *   pnpm generate:media --target videos
 */

import { execFile } from 'node:child_process';
import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import chalk from 'chalk';
import {
  ensureDirectory,
  extractLastNumber,
  extractLeadingNumber,
  folderNameToDisplayName,
  getBaseName,
  hasExtension,
  hasFilename,
  isErrnoException,
  naturalCompare,
  readDirents,
  readFilenames,
  readJsonFileIfExists,
  toPublicUrl,
  writeJsonFile,
} from './lib/manifest-utils';

type MediaTarget = 'comics' | 'music' | 'videos';

const ALL_TARGETS: readonly MediaTarget[] = ['comics', 'music', 'videos'];

const COMIC_BASE_DIR = 'public/img/comic';
const MUSIC_BASE_DIR = 'public/music';
const VIDEO_BASE_DIR = 'public/media';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'] as const;
const MUSIC_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;
const AUDIO_EXTENSIONS = ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.opus', '.wma'] as const;
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m4v', '.mkv', '.avi'] as const;
const COMIC_COVER_FILENAMES = ['cover.jpg', 'cover.jpeg', 'cover.png', 'cover.webp'] as const;
const MUSIC_COVER_FILENAMES = ['cover.jpg', 'cover.jpeg', 'cover.png', 'cover.webp', 'folder.jpg', 'folder.png'] as const;
const SIDECAR_SCHEMA = 1;

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

interface ParsedArgs {
  targets: MediaTarget[];
  force: boolean;
}

interface ComicManifest {
  id: string;
  name: string;
  author?: string;
  cover?: string;
  images: string[];
}

interface ComicFolder {
  path: string;
  name: string;
  files: string[];
  images: string[];
  coverFile: string | null;
  hasManifest: boolean;
}

interface MusicTrack {
  name: string;
  artist: string;
  url: string;
  pic: string;
  lrc: string;
}

interface MusicManifest {
  id: string;
  name: string;
  cover?: string;
  tracks: MusicTrack[];
}

interface MusicFolder {
  path: string;
  name: string;
  files: string[];
  audioFiles: string[];
  coverFile: string | null;
  hasManifest: boolean;
}

interface FfprobeFormat {
  filename?: string;
  nb_streams?: number;
  format_name?: string;
  format_long_name?: string;
  start_time?: string;
  duration?: string;
  size?: string;
  bit_rate?: string;
}

interface FfprobeStream {
  index?: number;
  codec_name?: string;
  codec_long_name?: string;
  codec_type?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  duration?: string;
  bit_rate?: string;
  nb_frames?: string;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
}

interface SourceStats {
  size: number;
  mtimeMs: number;
}

interface VideoMetadata {
  schema: number;
  source: string;
  generatedAt: string;
  sourceStats: SourceStats;
  format: {
    name?: string;
    longName?: string;
    duration?: number;
    bitrate?: number;
    size?: number;
  };
  video: {
    codec?: string;
    codecLongName?: string;
    width?: number;
    height?: number;
    fps?: number;
    fpsSource?: 'avg_frame_rate' | 'r_frame_rate';
    bitrate?: number;
    bitrateSource?: 'stream';
    frames?: number;
    duration?: number;
  };
}

interface VideoFile {
  filePath: string;
  sidecarPath: string;
  publicUrl: string;
  stats: SourceStats;
}

function parseTarget(value: string): MediaTarget {
  if (value === 'comics' || value === 'comic') return 'comics';
  if (value === 'music') return 'music';
  if (value === 'videos' || value === 'video') return 'videos';
  throw new Error(`Unknown media target "${value}". Expected one of: ${ALL_TARGETS.join(', ')}`);
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const targets = new Set<MediaTarget>();
  let force = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--force') {
      force = true;
      continue;
    }

    if (arg === '--target' || arg === '--type') {
      const rawTarget = args[i + 1];
      if (!rawTarget) throw new Error(`${arg} requires a target value`);
      for (const target of rawTarget.split(',')) {
        targets.add(parseTarget(target.trim()));
      }
      i++;
      continue;
    }

    throw new Error(`Unknown argument "${arg}"`);
  }

  return {
    targets: targets.size > 0 ? Array.from(targets) : [...ALL_TARGETS],
    force,
  };
}

async function readBaseDirents(baseDir: string, label: string) {
  try {
    return await readDirents(baseDir);
  } catch (error) {
    if (!isErrnoException(error, 'ENOENT')) throw error;
    console.log(chalk.yellow(`${label} directory not found: ${baseDir}`));
    console.log(chalk.dim('Creating directory...'));
    await ensureDirectory(baseDir);
    return [];
  }
}

function isComicImageFile(filename: string): boolean {
  return hasExtension(filename, IMAGE_EXTENSIONS);
}

function isComicCoverFile(filename: string): boolean {
  return hasFilename(filename, COMIC_COVER_FILENAMES);
}

function compareComicImages(a: string, b: string): number {
  const numA = extractLastNumber(a);
  const numB = extractLastNumber(b);
  if (numA !== numB) return numA - numB;
  return naturalCompare(a, b);
}

async function scanComicFolders(): Promise<ComicFolder[]> {
  const folders: ComicFolder[] = [];
  const entries = await readBaseDirents(COMIC_BASE_DIR, 'Comic');

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const folderPath = path.join(COMIC_BASE_DIR, entry.name);
    const files = await readFilenames(folderPath);
    const coverFile = files.find((file) => isComicCoverFile(file)) ?? null;
    const images = files.filter((file) => isComicImageFile(file) && !isComicCoverFile(file)).sort(compareComicImages);
    const hasManifest = files.includes('manifest.json');

    if (images.length > 0) {
      folders.push({ path: folderPath, name: entry.name, files, images, coverFile, hasManifest });
    }
  }

  return folders;
}

function determineComicCoverPath(folder: ComicFolder): string {
  if (folder.coverFile) return `/img/comic/${folder.name}/${folder.coverFile}`;
  if (folder.images.length > 0) return `/img/comic/${folder.name}/${folder.images[0]}`;
  return '';
}

async function generateComicManifest(folder: ComicFolder, force: boolean): Promise<boolean> {
  const manifestPath = path.join(folder.path, 'manifest.json');
  const existing = await readJsonFileIfExists<ComicManifest>(manifestPath);

  if (folder.hasManifest && !force && existing) {
    return false;
  }

  const coverPath = determineComicCoverPath(folder);
  const manifest: ComicManifest = {
    id: folder.name,
    name: existing?.name || folderNameToDisplayName(folder.name),
    ...(existing?.author && { author: existing.author }),
    ...(coverPath && { cover: coverPath }),
    images: folder.images.map((image) => `/img/comic/${folder.name}/${image}`),
  };

  await writeJsonFile(manifestPath, manifest);
  return true;
}

async function runComicGenerator(force: boolean): Promise<void> {
  console.log(chalk.blue.bold('\n=== Comic Manifest Generator ===\n'));
  if (force) console.log(chalk.yellow('Force mode: regenerating all comic manifests\n'));

  console.log(chalk.cyan('Scanning comic folders...'));
  const folders = await scanComicFolders();

  if (folders.length === 0) {
    console.log(chalk.yellow('\nNo comic folders found.'));
    console.log(chalk.dim(`Add comic images to: ${COMIC_BASE_DIR}/<comic-name>/`));
    return;
  }

  console.log(chalk.green(`Found ${folders.length} comic folder(s)\n`));

  let generated = 0;
  let skipped = 0;

  for (const folder of folders) {
    const wasGenerated = await generateComicManifest(folder, force);
    if (wasGenerated) {
      const coverInfo = folder.coverFile ? `cover: ${folder.coverFile}` : 'cover: first image';
      console.log(chalk.green(`  Generated manifest for ${folder.name} (${folder.images.length} images, ${coverInfo})`));
      generated++;
    } else {
      skipped++;
    }
  }

  console.log(chalk.blue.bold('\n=== Comic Summary ==='));
  console.log(chalk.green(`  Generated: ${generated}`));
  console.log(chalk.dim(`  Skipped: ${skipped}`));
}

function isAudioFile(filename: string): boolean {
  return hasExtension(filename, AUDIO_EXTENSIONS);
}

function isMusicImageFile(filename: string): boolean {
  return hasExtension(filename, MUSIC_IMAGE_EXTENSIONS);
}

function isMusicCoverFile(filename: string): boolean {
  return hasFilename(filename, MUSIC_COVER_FILENAMES);
}

function compareAudioFiles(a: string, b: string): number {
  const numA = extractLeadingNumber(a);
  const numB = extractLeadingNumber(b);
  if (numA !== numB) return numA - numB;
  return naturalCompare(a, b);
}

function parseTrackInfo(filename: string): { name: string; artist: string } {
  const baseName = getBaseName(filename);
  const stripped = baseName.replace(/^\d+[\s]*[-._)]\s*/, '');
  const dashParts = stripped.split(/\s+-\s+/);

  if (dashParts.length >= 2) {
    return { artist: dashParts[0].trim(), name: dashParts.slice(1).join(' - ').trim() };
  }

  return { name: stripped.trim() || baseName, artist: '' };
}

async function scanMusicFolders(): Promise<MusicFolder[]> {
  const folders: MusicFolder[] = [];
  const entries = await readBaseDirents(MUSIC_BASE_DIR, 'Music');

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const folderPath = path.join(MUSIC_BASE_DIR, entry.name);
    const files = await readFilenames(folderPath);
    const coverFile = files.find((file) => isMusicCoverFile(file)) ?? null;
    const audioFiles = files.filter((file) => isAudioFile(file)).sort(compareAudioFiles);
    const hasManifest = files.includes('manifest.json');

    if (audioFiles.length > 0) {
      folders.push({ path: folderPath, name: entry.name, files, audioFiles, coverFile, hasManifest });
    }
  }

  return folders;
}

function buildMusicTrack(folder: MusicFolder, audioFile: string, existingTrack?: MusicTrack): MusicTrack {
  const baseName = getBaseName(audioFile);
  const parsed = parseTrackInfo(audioFile);
  const audioUrl = `/music/${folder.name}/${audioFile}`;
  const lrcFile = folder.files.find((file) => getBaseName(file) === baseName && path.extname(file).toLowerCase() === '.lrc');
  const trackCoverFile = folder.files.find((file) => getBaseName(file) === baseName && isMusicImageFile(file));
  const playlistCover = folder.coverFile ? `/music/${folder.name}/${folder.coverFile}` : '';

  return {
    name: existingTrack?.name || parsed.name,
    artist: existingTrack?.artist || parsed.artist,
    url: audioUrl,
    pic: existingTrack?.pic || (trackCoverFile ? `/music/${folder.name}/${trackCoverFile}` : playlistCover),
    lrc: existingTrack?.lrc || (lrcFile ? `/music/${folder.name}/${lrcFile}` : ''),
  };
}

async function generateMusicManifest(folder: MusicFolder, force: boolean): Promise<boolean> {
  const manifestPath = path.join(folder.path, 'manifest.json');
  const existing = await readJsonFileIfExists<MusicManifest>(manifestPath);

  if (folder.hasManifest && !force && existing) {
    console.log(chalk.dim(`  Skipping ${folder.name} (manifest exists)`));
    return false;
  }

  const existingByUrl = new Map<string, MusicTrack>();
  if (existing?.tracks) {
    for (const track of existing.tracks) {
      existingByUrl.set(track.url, track);
    }
  }

  const playlistCover = folder.coverFile ? `/music/${folder.name}/${folder.coverFile}` : '';
  const tracks = folder.audioFiles.map((audioFile) => {
    const audioUrl = `/music/${folder.name}/${audioFile}`;
    return buildMusicTrack(folder, audioFile, existingByUrl.get(audioUrl));
  });

  const manifest: MusicManifest = {
    id: folder.name,
    name: existing?.name || folderNameToDisplayName(folder.name),
    ...(playlistCover && { cover: playlistCover }),
    tracks,
  };

  await writeJsonFile(manifestPath, manifest);
  return true;
}

async function runMusicGenerator(force: boolean): Promise<void> {
  console.log(chalk.blue.bold('\n=== Music Manifest Generator ===\n'));
  if (force) console.log(chalk.yellow('Force mode: regenerating all music manifests\n'));

  console.log(chalk.cyan('Scanning music folders...'));
  const folders = await scanMusicFolders();

  if (folders.length === 0) {
    console.log(chalk.yellow('\nNo music folders found.'));
    console.log(chalk.dim(`Add audio files to: ${MUSIC_BASE_DIR}/<playlist-name>/`));
    return;
  }

  console.log(chalk.green(`Found ${folders.length} music folder(s)\n`));

  let generated = 0;
  let skipped = 0;

  for (const folder of folders) {
    const wasGenerated = await generateMusicManifest(folder, force);
    if (wasGenerated) {
      const coverInfo = folder.coverFile ? `cover: ${folder.coverFile}` : 'no cover';
      console.log(chalk.green(`  Generated manifest for ${folder.name} (${folder.audioFiles.length} tracks, ${coverInfo})`));
      generated++;
    } else {
      skipped++;
    }
  }

  console.log(chalk.blue.bold('\n=== Music Summary ==='));
  console.log(chalk.green(`  Generated: ${generated}`));
  console.log(chalk.dim(`  Skipped: ${skipped}`));
}

function isVideoFile(filename: string): boolean {
  return hasExtension(filename, VIDEO_EXTENSIONS);
}

function parseNumber(value: string | number | undefined): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (!value) return undefined;

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseInteger(value: string | number | undefined): number | undefined {
  const parsed = parseNumber(value);
  return parsed === undefined ? undefined : Math.trunc(parsed);
}

function parseFrameRate(value: string | undefined): number | undefined {
  if (!value || value === '0/0') return undefined;

  const [numeratorRaw, denominatorRaw] = value.split('/');
  if (denominatorRaw === undefined) return parseNumber(value);

  const numerator = Number.parseFloat(numeratorRaw);
  const denominator = Number.parseFloat(denominatorRaw);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return undefined;

  const fps = numerator / denominator;
  return Number.isFinite(fps) && fps > 0 ? fps : undefined;
}

function normalizeFps(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.round(value * 1000) / 1000;
}

function normalizeBitrate(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.round(value);
}

async function findFfprobePath(): Promise<string> {
  if (process.env.FFPROBE_PATH) return process.env.FFPROBE_PATH;

  try {
    const staticModule = require('ffprobe-static') as { path?: string } | string;
    if (typeof staticModule === 'string') return staticModule;
    if (staticModule.path) return staticModule.path;
  } catch {
    // Optional dependency is not installed; use ffprobe from PATH.
  }

  return 'ffprobe';
}

async function canRunFfprobe(ffprobePath: string): Promise<boolean> {
  try {
    await execFileAsync(ffprobePath, ['-version'], { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

async function scanVideos(dir = VIDEO_BASE_DIR, isRoot = true): Promise<VideoFile[]> {
  const videos: VideoFile[] = [];

  let entries: Dirent[];
  try {
    entries = await readDirents(dir);
  } catch (error) {
    if (!isRoot || !isErrnoException(error, 'ENOENT')) throw error;
    console.log(chalk.yellow(`Video directory not found: ${VIDEO_BASE_DIR}`));
    console.log(chalk.dim('Creating directory...'));
    await ensureDirectory(VIDEO_BASE_DIR);
    return [];
  }

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      videos.push(...(await scanVideos(entryPath, false)));
      continue;
    }

    if (!entry.isFile() || !isVideoFile(entry.name)) continue;

    const stat = await fs.stat(entryPath);
    videos.push({
      filePath: entryPath,
      sidecarPath: `${entryPath}.json`,
      publicUrl: toPublicUrl(entryPath),
      stats: {
        size: stat.size,
        mtimeMs: Math.round(stat.mtimeMs),
      },
    });
  }

  return videos;
}

function isFreshVideoMetadata(existing: VideoMetadata | null, video: VideoFile): boolean {
  return (
    existing?.schema === SIDECAR_SCHEMA &&
    existing.sourceStats?.size === video.stats.size &&
    existing.sourceStats?.mtimeMs === video.stats.mtimeMs
  );
}

async function probeVideo(ffprobePath: string, video: VideoFile): Promise<FfprobeOutput> {
  const { stdout } = await execFileAsync(
    ffprobePath,
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', video.filePath],
    {
      maxBuffer: 1024 * 1024 * 16,
      windowsHide: true,
    },
  );

  return JSON.parse(stdout) as FfprobeOutput;
}

function buildVideoMetadata(video: VideoFile, probe: FfprobeOutput): VideoMetadata {
  const videoStream = probe.streams?.find((stream) => stream.codec_type === 'video') ?? {};
  const fpsFromAvg = parseFrameRate(videoStream.avg_frame_rate);
  const fpsFromR = parseFrameRate(videoStream.r_frame_rate);
  const fps = normalizeFps(fpsFromAvg ?? fpsFromR);
  const formatDuration = parseNumber(probe.format?.duration);
  const formatBitrate = normalizeBitrate(parseInteger(probe.format?.bit_rate));
  const formatSize = parseInteger(probe.format?.size);
  const streamBitrate = normalizeBitrate(parseInteger(videoStream.bit_rate));
  const frameCount = parseInteger(videoStream.nb_frames);
  const streamDuration = parseNumber(videoStream.duration);

  return {
    schema: SIDECAR_SCHEMA,
    source: video.publicUrl,
    generatedAt: new Date().toISOString(),
    sourceStats: video.stats,
    format: {
      ...(probe.format?.format_name && { name: probe.format.format_name }),
      ...(probe.format?.format_long_name && { longName: probe.format.format_long_name }),
      ...(formatDuration !== undefined && { duration: formatDuration }),
      ...(formatBitrate !== undefined && { bitrate: formatBitrate }),
      ...(formatSize !== undefined && { size: formatSize }),
    },
    video: {
      ...(videoStream.codec_name && { codec: videoStream.codec_name }),
      ...(videoStream.codec_long_name && { codecLongName: videoStream.codec_long_name }),
      ...(videoStream.width && { width: videoStream.width }),
      ...(videoStream.height && { height: videoStream.height }),
      ...(fps !== undefined && {
        fps,
        fpsSource: fpsFromAvg !== undefined ? ('avg_frame_rate' as const) : ('r_frame_rate' as const),
      }),
      ...(streamBitrate !== undefined && {
        bitrate: streamBitrate,
        bitrateSource: 'stream' as const,
      }),
      ...(frameCount !== undefined && { frames: frameCount }),
      ...(streamDuration !== undefined && { duration: streamDuration }),
    },
  };
}

async function generateVideoMetadata(ffprobePath: string, video: VideoFile, force: boolean): Promise<boolean> {
  if (!force) {
    const existing = await readJsonFileIfExists<VideoMetadata>(video.sidecarPath);
    if (isFreshVideoMetadata(existing, video)) {
      console.log(chalk.dim(`  Skipping ${video.publicUrl} (metadata is fresh)`));
      return false;
    }
  }

  const probe = await probeVideo(ffprobePath, video);
  const metadata = buildVideoMetadata(video, probe);
  await writeJsonFile(video.sidecarPath, metadata);
  return true;
}

async function runVideoGenerator(force: boolean): Promise<void> {
  if (force) console.log(chalk.yellow('Force mode: regenerating all video metadata\n'));

  const ffprobePath = await findFfprobePath();
  if (!(await canRunFfprobe(ffprobePath))) {
    console.log(chalk.yellow('ffprobe was not found. Skipping video metadata generation.'));
    console.log(chalk.dim('Install FFmpeg/ffprobe, set FFPROBE_PATH, or add optional ffprobe-static dependency.'));
    return;
  }

  const videos = await scanVideos();
  if (videos.length === 0) {
    return;
  }

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const video of videos) {
    try {
      const wasGenerated = await generateVideoMetadata(ffprobePath, video, force);
      if (wasGenerated) {
        console.log(chalk.green(`  Generated metadata for ${video.publicUrl}`));
        generated++;
      } else {
        skipped++;
      }
    } catch (error) {
      failed++;
      console.log(chalk.red(`  Failed to generate metadata for ${video.publicUrl}`));
      console.log(chalk.dim(`  ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  if (failed > 0) console.log(chalk.red(`  Failed: ${failed}`));
}

async function main(): Promise<void> {
  const { targets, force } = parseArgs();

  for (const target of targets) {
    if (target === 'comics') {
      await runComicGenerator(force);
    } else if (target === 'music') {
      await runMusicGenerator(force);
    } else {
      await runVideoGenerator(force);
    }
  }

  console.log();
}

main().catch((error) => {
  console.error(chalk.red('\nError:'), error);
  process.exit(1);
});
