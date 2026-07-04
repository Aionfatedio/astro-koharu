/**
 * Local music manifest generator — scans public/music/<playlist>/ folders and
 * writes a manifest.json (Meting-compatible track list) per folder, pairing
 * audio files with sibling .lrc lyrics and cover images by basename.
 */

import path from 'node:path';
import chalk from 'chalk';
import {
  extractLeadingNumber,
  folderNameToDisplayName,
  getBaseName,
  hasExtension,
  hasFilename,
  naturalCompare,
  readBaseDirents,
  readFilenames,
  readJsonFileIfExists,
  writeJsonFile,
} from './manifest-utils';

const MUSIC_BASE_DIR = 'public/music';
const MUSIC_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;
const AUDIO_EXTENSIONS = ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.opus', '.wma'] as const;
const MUSIC_COVER_FILENAMES = ['cover.jpg', 'cover.jpeg', 'cover.png', 'cover.webp', 'folder.jpg', 'folder.png'] as const;

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

export async function runMusicGenerator(force: boolean): Promise<void> {
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
