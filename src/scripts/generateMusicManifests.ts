/**
 * Generate manifest.json files for local music playlists
 *
 * This script:
 * 1. Scans public/music/ directory for playlist folders
 * 2. Each folder should contain audio files (.mp3/.flac/.wav/.ogg/.m4a)
 * 3. Generates manifest.json with track list in natural sort order
 * 4. Auto-detects cover image and matches .lrc lyrics files
 *
 * Usage:
 *   pnpm generate:music
 *   pnpm generate:music --force  # Regenerate all manifests
 *
 * Folder structure:
 *   public/music/
 *     └── my-playlist/
 *         ├── cover.jpg              (optional, playlist-level cover)
 *         ├── 01 - Song Name.mp3
 *         ├── 01 - Song Name.lrc     (optional, auto-matched lyrics)
 *         ├── 01 - Song Name.jpg     (optional, per-track cover)
 *         ├── 02 - Another Song.flac
 *         └── manifest.json          (generated)
 *
 * Track name parsing:
 *   "01 - Song Name.mp3"     → name: "Song Name"
 *   "02. Another Song.flac"  → name: "Another Song"
 *   "Artist - Title.mp3"     → name: "Title", artist: "Artist"  (when no leading number)
 *   "Song.mp3"               → name: "Song"
 *
 * Manifest fields (user-editable after generation):
 *   tracks[].name    — display name (auto-parsed, preserved on regeneration)
 *   tracks[].artist  — artist name (auto-parsed, preserved on regeneration)
 *   tracks[].pic     — cover image path (auto-detected, preserved on regeneration)
 *   tracks[].lrc     — lyrics file path (auto-matched, preserved on regeneration)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';

// --------- Configuration ---------
const MUSIC_BASE_DIR = 'public/music';
const AUDIO_EXTENSIONS = ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.opus', '.wma'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const COVER_FILENAMES = ['cover.jpg', 'cover.jpeg', 'cover.png', 'cover.webp', 'folder.jpg', 'folder.png'];

// --------- Type Definitions ---------
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
  audioFiles: string[];
  coverFile: string | null;
  hasManifest: boolean;
}

// --------- Utility Functions ---------

function isAudioFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return AUDIO_EXTENSIONS.includes(ext);
}

function isImageFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

function isCoverFile(filename: string): boolean {
  return COVER_FILENAMES.includes(filename.toLowerCase());
}

/** Get filename without extension */
function getBaseName(filename: string): string {
  return path.basename(filename, path.extname(filename));
}

/**
 * Extract leading number from filename for sorting.
 * Supports: "01 - Song.mp3", "1. Song.flac", "001_song.wav", "track01.mp3"
 */
function extractLeadingNumber(filename: string): number {
  const baseName = getBaseName(filename);
  const match = baseName.match(/^(\d+)/);
  return match ? Number.parseInt(match[1], 10) : Number.POSITIVE_INFINITY;
}

/**
 * Parse track name and artist from filename.
 *
 * Priority parsing:
 *   "01 - Artist - Title.mp3" → { name: "Title", artist: "Artist" }
 *   "01 - Song Name.mp3"      → { name: "Song Name", artist: "" }
 *   "01. Song Name.mp3"       → { name: "Song Name", artist: "" }
 *   "Artist - Title.mp3"      → { name: "Title", artist: "Artist" }
 *   "Song Name.mp3"           → { name: "Song Name", artist: "" }
 */
function parseTrackInfo(filename: string): { name: string; artist: string } {
  const baseName = getBaseName(filename);

  // Strip leading number prefix: "01 - ...", "01. ...", "01_...", "01 ..."
  const stripped = baseName.replace(/^\d+[\s]*[-._)]\s*/, '');

  // Try "Artist - Title" pattern in the remaining string
  const dashParts = stripped.split(/\s+-\s+/);
  if (dashParts.length >= 2) {
    return { artist: dashParts[0].trim(), name: dashParts.slice(1).join(' - ').trim() };
  }

  // No artist separator found
  return { name: stripped.trim() || baseName, artist: '' };
}

/** Convert folder name to display name */
function folderNameToDisplayName(folderName: string): string {
  return folderName.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// --------- Main Functions ---------

async function scanMusicFolders(): Promise<MusicFolder[]> {
  const folders: MusicFolder[] = [];

  try {
    const entries = await fs.readdir(MUSIC_BASE_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const folderPath = path.join(MUSIC_BASE_DIR, entry.name);
      const files = await fs.readdir(folderPath);

      const coverFile = files.find((f) => isCoverFile(f)) || null;

      const audioFiles = files
        .filter((f) => isAudioFile(f))
        .sort((a, b) => {
          const numA = extractLeadingNumber(a);
          const numB = extractLeadingNumber(b);
          if (numA !== numB) return numA - numB;
          return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        });

      const hasManifest = files.includes('manifest.json');

      if (audioFiles.length > 0) {
        folders.push({ path: folderPath, name: entry.name, audioFiles, coverFile, hasManifest });
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log(chalk.yellow(`Music directory not found: ${MUSIC_BASE_DIR}`));
      console.log(chalk.dim('Creating directory...'));
      await fs.mkdir(MUSIC_BASE_DIR, { recursive: true });
    } else {
      throw error;
    }
  }

  return folders;
}

async function readExistingManifest(folderPath: string): Promise<MusicManifest | null> {
  const manifestPath = path.join(folderPath, 'manifest.json');
  try {
    const content = await fs.readFile(manifestPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function buildTrack(folder: MusicFolder, audioFile: string, allFiles: string[], existingTrack?: MusicTrack): MusicTrack {
  const baseName = getBaseName(audioFile);
  const parsed = parseTrackInfo(audioFile);
  const audioUrl = `/music/${folder.name}/${audioFile}`;

  // Match .lrc file (same base name)
  const lrcFile = allFiles.find((f) => getBaseName(f) === baseName && path.extname(f).toLowerCase() === '.lrc');
  const lrcUrl = lrcFile ? `/music/${folder.name}/${lrcFile}` : '';

  // Match per-track cover (same base name, image extension)
  const trackCoverFile = allFiles.find((f) => getBaseName(f) === baseName && isImageFile(f));
  const trackCoverUrl = trackCoverFile ? `/music/${folder.name}/${trackCoverFile}` : '';

  // Playlist-level cover fallback
  const playlistCover = folder.coverFile ? `/music/${folder.name}/${folder.coverFile}` : '';

  return {
    name: existingTrack?.name || parsed.name,
    artist: existingTrack?.artist || parsed.artist,
    url: audioUrl,
    pic: existingTrack?.pic || trackCoverUrl || playlistCover,
    lrc: existingTrack?.lrc || lrcUrl,
  };
}

async function generateManifest(folder: MusicFolder, force: boolean): Promise<boolean> {
  const manifestPath = path.join(folder.path, 'manifest.json');

  if (folder.hasManifest && !force) {
    const existing = await readExistingManifest(folder.path);
    if (existing) {
      console.log(chalk.dim(`  Skipping ${folder.name} (manifest exists)`));
      return false;
    }
  }

  const existing = await readExistingManifest(folder.path);
  const allFiles = await fs.readdir(folder.path);

  // Build lookup of existing tracks by url for preserving user edits
  const existingByUrl = new Map<string, MusicTrack>();
  if (existing?.tracks) {
    for (const track of existing.tracks) {
      existingByUrl.set(track.url, track);
    }
  }

  const playlistCover = folder.coverFile ? `/music/${folder.name}/${folder.coverFile}` : '';

  const tracks = folder.audioFiles.map((audioFile) => {
    const audioUrl = `/music/${folder.name}/${audioFile}`;
    return buildTrack(folder, audioFile, allFiles, existingByUrl.get(audioUrl));
  });

  const manifest: MusicManifest = {
    id: folder.name,
    name: existing?.name || folderNameToDisplayName(folder.name),
    ...(playlistCover && { cover: playlistCover }),
    tracks,
  };

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
  return true;
}

// --------- Main Entry Point ---------

async function main() {
  console.log(chalk.blue.bold('\n=== Music Manifest Generator ===\n'));

  const force = process.argv.includes('--force');
  if (force) {
    console.log(chalk.yellow('Force mode: regenerating all manifests\n'));
  }

  console.log(chalk.cyan('Scanning music folders...'));
  const folders = await scanMusicFolders();

  if (folders.length === 0) {
    console.log(chalk.yellow('\nNo music folders found.'));
    console.log(chalk.dim(`Add audio files to: ${MUSIC_BASE_DIR}/<playlist-name>/`));
    console.log(chalk.dim('Example structure:'));
    console.log(chalk.dim('  public/music/my-playlist/cover.jpg (optional)'));
    console.log(chalk.dim('  public/music/my-playlist/01 - Song Name.mp3'));
    console.log(chalk.dim('  public/music/my-playlist/01 - Song Name.lrc (optional)'));
    console.log(chalk.dim('  public/music/my-playlist/02 - Another Song.flac'));
    return;
  }

  console.log(chalk.green(`Found ${folders.length} music folder(s)\n`));

  let generated = 0;
  let skipped = 0;

  for (const folder of folders) {
    const wasGenerated = await generateManifest(folder, force);
    if (wasGenerated) {
      const trackCount = folder.audioFiles.length;
      const coverInfo = folder.coverFile ? `cover: ${folder.coverFile}` : 'no cover';
      console.log(chalk.green(`  Generated manifest for ${folder.name} (${trackCount} tracks, ${coverInfo})`));
      generated++;
    } else {
      skipped++;
    }
  }

  console.log(chalk.blue.bold('\n=== Summary ==='));
  console.log(chalk.green(`  Generated: ${generated}`));
  console.log(chalk.dim(`  Skipped: ${skipped}`));

  if (generated > 0) {
    console.log(chalk.cyan('\nUsage in site.yaml:'));
    console.log(chalk.dim('  bgm:'));
    console.log(chalk.dim('    audio:'));
    for (const folder of folders) {
      console.log(chalk.dim(`      - title: ${folderNameToDisplayName(folder.name)}`));
      console.log(chalk.dim(`        list:`));
      console.log(chalk.dim(`          - /music/${folder.name}`));
    }
    console.log(chalk.dim('\nTip: Edit manifest.json to customize track names, artists, and covers'));
    console.log(chalk.dim('     User edits are preserved when regenerating (unless --force)'));
  }

  console.log();
}

main().catch((error) => {
  console.error(chalk.red('\nError:'), error);
  process.exit(1);
});
