/**
 * Video metadata generator — probes public/media/ videos with ffprobe and
 * writes a <file>.json sidecar (codec/fps/bitrate/duration) next to each,
 * skipped while size+mtime are unchanged.
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
  hasExtension,
  isErrnoException,
  readDirents,
  readJsonFileIfExists,
  toPublicUrl,
  writeJsonFile,
} from './manifest-utils';

const VIDEO_BASE_DIR = 'public/media';
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m4v', '.mkv', '.avi'] as const;
const SIDECAR_SCHEMA = 1;

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

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
      return false;
    }
  }

  const probe = await probeVideo(ffprobePath, video);
  const metadata = buildVideoMetadata(video, probe);
  await writeJsonFile(video.sidecarPath, metadata);
  return true;
}

export async function runVideoGenerator(force: boolean): Promise<void> {
  console.log(chalk.blue.bold('\n=== Video Metadata Generator ===\n'));
  if (force) console.log(chalk.yellow('Force mode: regenerating all video metadata\n'));

  const ffprobePath = await findFfprobePath();
  if (!(await canRunFfprobe(ffprobePath))) {
    console.log(chalk.yellow('ffprobe was not found. Skipping video metadata generation.'));
    console.log(chalk.dim('Install FFmpeg/ffprobe, set FFPROBE_PATH, or add optional ffprobe-static dependency.'));
    return;
  }

  const videos = await scanVideos();
  if (videos.length === 0) {
    console.log(chalk.yellow('\nNo video files found.'));
    console.log(chalk.dim(`Add video files to: ${VIDEO_BASE_DIR}/`));
    return;
  }

  console.log(chalk.green(`Found ${videos.length} video file(s)\n`));

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

  console.log(chalk.blue.bold('\n=== Video Summary ==='));
  console.log(chalk.green(`  Generated: ${generated}`));
  console.log(chalk.dim(`  Skipped: ${skipped}`));
  if (failed > 0) console.log(chalk.red(`  Failed: ${failed}`));
}
