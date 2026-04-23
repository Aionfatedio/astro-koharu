/**
 * Generate sidecar metadata JSON files for local videos.
 *
 * This script scans public/media for video files and writes a sidecar JSON next
 * to each video, e.g. public/media/demo.mp4 -> public/media/demo.mp4.json.
 * Existing sidecars are reused when file size and mtime match.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import chalk from 'chalk';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

const VIDEO_BASE_DIR = 'public/media';
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.mkv', '.avi']);
const SIDECAR_SCHEMA = 1;

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
  return VIDEO_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function toPublicUrl(filePath: string): string {
  const relative = path.relative('public', filePath);
  return `/${relative.split(path.sep).join('/')}`;
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

async function findFfprobePath(): Promise<string | null> {
  if (process.env.FFPROBE_PATH) return process.env.FFPROBE_PATH;

  try {
    const staticModule = require('ffprobe-static') as { path?: string } | string;
    if (typeof staticModule === 'string') return staticModule;
    if (staticModule.path) return staticModule.path;
  } catch {
    // Optional dependency is not installed; fall back to PATH.
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

async function scanVideos(dir = VIDEO_BASE_DIR): Promise<VideoFile[]> {
  const videos: VideoFile[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        videos.push(...(await scanVideos(entryPath)));
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
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log(chalk.yellow(`Video directory not found: ${VIDEO_BASE_DIR}`));
      console.log(chalk.dim('Creating directory...'));
      await fs.mkdir(VIDEO_BASE_DIR, { recursive: true });
      return [];
    }

    throw error;
  }

  return videos;
}

async function readExistingMetadata(sidecarPath: string): Promise<VideoMetadata | null> {
  try {
    const content = await fs.readFile(sidecarPath, 'utf-8');
    return JSON.parse(content) as VideoMetadata;
  } catch {
    return null;
  }
}

function isFresh(existing: VideoMetadata | null, video: VideoFile): boolean {
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

function buildMetadata(video: VideoFile, probe: FfprobeOutput): VideoMetadata {
  const videoStream = probe.streams?.find((stream) => stream.codec_type === 'video') ?? {};
  const fpsFromAvg = parseFrameRate(videoStream.avg_frame_rate);
  const fpsFromR = parseFrameRate(videoStream.r_frame_rate);
  const fps = normalizeFps(fpsFromAvg ?? fpsFromR);

  return {
    schema: SIDECAR_SCHEMA,
    source: video.publicUrl,
    generatedAt: new Date().toISOString(),
    sourceStats: video.stats,
    format: {
      ...(probe.format?.format_name && { name: probe.format.format_name }),
      ...(probe.format?.format_long_name && { longName: probe.format.format_long_name }),
      ...(parseNumber(probe.format?.duration) !== undefined && { duration: parseNumber(probe.format?.duration) }),
      ...(normalizeBitrate(parseInteger(probe.format?.bit_rate)) !== undefined && {
        bitrate: normalizeBitrate(parseInteger(probe.format?.bit_rate)),
      }),
      ...(parseInteger(probe.format?.size) !== undefined && { size: parseInteger(probe.format?.size) }),
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
      ...(normalizeBitrate(parseInteger(videoStream.bit_rate)) !== undefined && {
        bitrate: normalizeBitrate(parseInteger(videoStream.bit_rate)),
        bitrateSource: 'stream' as const,
      }),
      ...(parseInteger(videoStream.nb_frames) !== undefined && { frames: parseInteger(videoStream.nb_frames) }),
      ...(parseNumber(videoStream.duration) !== undefined && { duration: parseNumber(videoStream.duration) }),
    },
  };
}

async function writeMetadata(video: VideoFile, metadata: VideoMetadata): Promise<void> {
  await fs.writeFile(video.sidecarPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf-8');
}

async function generateMetadata(ffprobePath: string, video: VideoFile, force: boolean): Promise<boolean> {
  if (!force) {
    const existing = await readExistingMetadata(video.sidecarPath);
    if (isFresh(existing, video)) {
      console.log(chalk.dim(`  Skipping ${video.publicUrl} (metadata is fresh)`));
      return false;
    }
  }

  const probe = await probeVideo(ffprobePath, video);
  const metadata = buildMetadata(video, probe);
  await writeMetadata(video, metadata);
  return true;
}

async function main() {
  console.log(chalk.blue.bold('\n=== Video Metadata Generator ===\n'));

  const force = process.argv.includes('--force');
  if (force) {
    console.log(chalk.yellow('Force mode: regenerating all video metadata\n'));
  }

  const ffprobePath = await findFfprobePath();
  if (!ffprobePath || !(await canRunFfprobe(ffprobePath))) {
    console.log(chalk.yellow('ffprobe was not found. Skipping video metadata generation.'));
    console.log(chalk.dim('Install FFmpeg/ffprobe, set FFPROBE_PATH, or add optional ffprobe-static dependency.'));
    return;
  }

  console.log(chalk.dim(`Using ffprobe: ${ffprobePath}`));
  console.log(chalk.cyan('Scanning local videos...'));

  const videos = await scanVideos();
  if (videos.length === 0) {
    console.log(chalk.yellow('\nNo local videos found.'));
    console.log(chalk.dim(`Add video files to: ${VIDEO_BASE_DIR}/`));
    return;
  }

  console.log(chalk.green(`Found ${videos.length} video file(s)\n`));

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const video of videos) {
    try {
      const wasGenerated = await generateMetadata(ffprobePath, video, force);
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

  console.log(chalk.blue.bold('\n=== Summary ==='));
  console.log(chalk.green(`  Generated: ${generated}`));
  console.log(chalk.dim(`  Skipped: ${skipped}`));
  if (failed > 0) {
    console.log(chalk.red(`  Failed: ${failed}`));
  }
  console.log();
}

main().catch((error) => {
  console.error(chalk.red('\nError:'), error);
  process.exit(1);
});
