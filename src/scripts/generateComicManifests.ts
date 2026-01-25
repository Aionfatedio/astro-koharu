/**
 * Generate manifest.json files for comic folders
 *
 * This script:
 * 1. Scans public/img/comic/ directory for comic folders
 * 2. Each folder should contain numbered image files (1.jpg, 2.png, etc.)
 * 3. Generates manifest.json with image list in correct order
 * 4. Auto-detects cover image (cover.* or first image)
 *
 * Usage:
 *   pnpm generate:comics
 *   pnpm generate:comics --force  # Regenerate all manifests
 *
 * Folder structure:
 *   public/img/comic/
 *     └── my-manga/
 *         ├── cover.jpg (optional, priority cover)
 *         ├── 001.jpg
 *         ├── 002.jpg
 *         ├── 003.png
 *         └── manifest.json (generated)
 *
 * Cover priority:
 *   1. ::comic{cover="..."} in Markdown (highest)
 *   2. cover.jpg/png/webp in folder
 *   3. First image in the list (fallback)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';

// --------- Configuration ---------
const COMIC_BASE_DIR = 'public/img/comic';
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const COVER_FILENAMES = ['cover.jpg', 'cover.jpeg', 'cover.png', 'cover.webp'];

// --------- Type Definitions ---------
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
  images: string[];
  coverFile: string | null;
  hasManifest: boolean;
}

// --------- Utility Functions ---------

/**
 * Check if a file is an image based on extension
 */
function isImageFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Check if a file is a cover image
 */
function isCoverFile(filename: string): boolean {
  return COVER_FILENAMES.includes(filename.toLowerCase());
}

/**
 * Extract number from filename for sorting
 * Supports: 001.jpg, 1.jpg, page_001.jpg, image-1.png, etc.
 */
function extractNumberFromFilename(filename: string): number {
  const nameWithoutExt = path.basename(filename, path.extname(filename));
  // Match the last sequence of digits in the filename
  const match = nameWithoutExt.match(/(\d+)(?!.*\d)/);
  return match ? parseInt(match[1], 10) : Infinity;
}

/**
 * Convert folder name to display name
 * Example: my-awesome-manga -> My Awesome Manga
 */
function folderNameToDisplayName(folderName: string): string {
  return folderName.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// --------- Main Functions ---------

/**
 * Scan comic directory and find all comic folders
 */
async function scanComicFolders(): Promise<ComicFolder[]> {
  const comicFolders: ComicFolder[] = [];

  try {
    const entries = await fs.readdir(COMIC_BASE_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const folderPath = path.join(COMIC_BASE_DIR, entry.name);
      const files = await fs.readdir(folderPath);

      // Find cover file (case-insensitive)
      const coverFile = files.find((f) => isCoverFile(f)) || null;

      // Filter image files (excluding cover) and sort by number
      const images = files
        .filter((f) => isImageFile(f) && !isCoverFile(f))
        .sort((a, b) => extractNumberFromFilename(a) - extractNumberFromFilename(b));

      const hasManifest = files.includes('manifest.json');

      if (images.length > 0) {
        comicFolders.push({
          path: folderPath,
          name: entry.name,
          images,
          coverFile,
          hasManifest,
        });
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log(chalk.yellow(`Comic directory not found: ${COMIC_BASE_DIR}`));
      console.log(chalk.dim('Creating directory...'));
      await fs.mkdir(COMIC_BASE_DIR, { recursive: true });
    } else {
      throw error;
    }
  }

  return comicFolders;
}

/**
 * Read existing manifest from a comic folder
 */
async function readExistingManifest(folderPath: string): Promise<ComicManifest | null> {
  const manifestPath = path.join(folderPath, 'manifest.json');
  try {
    const content = await fs.readFile(manifestPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Determine cover path for a comic folder
 * Priority: cover.* file > first image
 */
function determineCoverPath(folder: ComicFolder): string {
  if (folder.coverFile) {
    // Use dedicated cover file
    return `/img/comic/${folder.name}/${folder.coverFile}`;
  }
  // Fallback to first image
  if (folder.images.length > 0) {
    return `/img/comic/${folder.name}/${folder.images[0]}`;
  }
  return '';
}

/**
 * Generate manifest for a comic folder
 */
async function generateManifest(folder: ComicFolder, force: boolean): Promise<boolean> {
  const manifestPath = path.join(folder.path, 'manifest.json');

  // Skip if manifest exists and not forcing
  if (folder.hasManifest && !force) {
    const existing = await readExistingManifest(folder.path);
    if (existing) {
      console.log(chalk.dim(`  Skipping ${folder.name} (manifest exists)`));
      return false;
    }
  }

  // Read existing manifest to preserve custom fields (author, name override)
  const existing = await readExistingManifest(folder.path);

  // Generate image URLs (relative paths from site root)
  const imageUrls = folder.images.map((img) => `/img/comic/${folder.name}/${img}`);

  // Determine cover path
  const coverPath = determineCoverPath(folder);

  const manifest: ComicManifest = {
    id: folder.name,
    name: existing?.name || folderNameToDisplayName(folder.name),
    ...(existing?.author && { author: existing.author }),
    ...(coverPath && { cover: coverPath }),
    images: imageUrls,
  };

  // Write manifest
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

  return true;
}

// --------- Main Entry Point ---------

async function main() {
  console.log(chalk.blue.bold('\n=== Comic Manifest Generator ===\n'));

  const force = process.argv.includes('--force');
  if (force) {
    console.log(chalk.yellow('Force mode: regenerating all manifests\n'));
  }

  // Scan for comic folders
  console.log(chalk.cyan('Scanning comic folders...'));
  const folders = await scanComicFolders();

  if (folders.length === 0) {
    console.log(chalk.yellow('\nNo comic folders found.'));
    console.log(chalk.dim(`Add comic images to: ${COMIC_BASE_DIR}/<comic-name>/`));
    console.log(chalk.dim('Example structure:'));
    console.log(chalk.dim('  public/img/comic/my-manga/cover.jpg (optional)'));
    console.log(chalk.dim('  public/img/comic/my-manga/001.jpg'));
    console.log(chalk.dim('  public/img/comic/my-manga/002.jpg'));
    return;
  }

  console.log(chalk.green(`Found ${folders.length} comic folder(s)\n`));

  // Process each folder
  let generated = 0;
  let skipped = 0;

  for (const folder of folders) {
    const wasGenerated = await generateManifest(folder, force);
    if (wasGenerated) {
      const coverInfo = folder.coverFile ? `cover: ${folder.coverFile}` : 'cover: first image';
      console.log(chalk.green(`  Generated manifest for ${folder.name} (${folder.images.length} images, ${coverInfo})`));
      generated++;
    } else {
      skipped++;
    }
  }

  // Summary
  console.log(chalk.blue.bold('\n=== Summary ==='));
  console.log(chalk.green(`  Generated: ${generated}`));
  console.log(chalk.dim(`  Skipped: ${skipped}`));

  // Usage hint
  if (generated > 0) {
    console.log(chalk.cyan('\nUsage in Markdown:'));
    for (const folder of folders) {
      console.log(chalk.dim(`  ::comic{id="${folder.name}" name="漫画名称" src="/img/comic/${folder.name}/manifest.json"}`));
    }
    console.log(chalk.dim('\nNote: Cover in ::comic{cover="..."} overrides manifest cover'));
  }

  console.log();
}

main().catch((error) => {
  console.error(chalk.red('\nError:'), error);
  process.exit(1);
});
