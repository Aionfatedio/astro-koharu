/**
 * Comic manifest generator — scans public/img/comic/<name>/ folders and writes
 * a manifest.json (id/name/cover/images) per folder.
 */

import path from 'node:path';
import chalk from 'chalk';
import {
  extractLastNumber,
  folderNameToDisplayName,
  hasExtension,
  hasFilename,
  naturalCompare,
  readBaseDirents,
  readFilenames,
  readJsonFileIfExists,
  writeJsonFile,
} from './manifest-utils';

const COMIC_BASE_DIR = 'public/img/comic';
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'] as const;
const COMIC_COVER_FILENAMES = ['cover.jpg', 'cover.jpeg', 'cover.png', 'cover.webp'] as const;

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

export async function runComicGenerator(force: boolean): Promise<void> {
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
