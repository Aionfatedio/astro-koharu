import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';

export function isErrnoException(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as NodeJS.ErrnoException).code === code;
}

export function hasExtension(filename: string, extensions: readonly string[]): boolean {
  return extensions.includes(path.extname(filename).toLowerCase());
}

export function hasFilename(filename: string, filenames: readonly string[]): boolean {
  return filenames.includes(filename.toLowerCase());
}

export function getBaseName(filename: string): string {
  return path.basename(filename, path.extname(filename));
}

export function folderNameToDisplayName(folderName: string): string {
  return folderName.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function extractLastNumber(filename: string): number {
  const nameWithoutExt = getBaseName(filename);
  const match = nameWithoutExt.match(/(\d+)(?!.*\d)/);
  return match ? Number.parseInt(match[1], 10) : Number.POSITIVE_INFINITY;
}

export function extractLeadingNumber(filename: string): number {
  const baseName = getBaseName(filename);
  const match = baseName.match(/^(\d+)/);
  return match ? Number.parseInt(match[1], 10) : Number.POSITIVE_INFINITY;
}

export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export async function readDirents(dir: string): Promise<Dirent[]> {
  return fs.readdir(dir, { withFileTypes: true });
}

export async function readFilenames(dir: string): Promise<string[]> {
  return fs.readdir(dir);
}

export async function ensureDirectory(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function readJsonFileIfExists<T>(filePath: string): Promise<T | null> {
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if (isErrnoException(error, 'ENOENT')) return null;
    throw error;
  }

  try {
    return JSON.parse(content) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${filePath}: ${message}`);
  }
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

export function toPublicUrl(filePath: string): string {
  const relative = path.relative('public', filePath);
  return `/${relative.split(path.sep).join('/')}`;
}

/** Read a media base directory's entries, creating it (with a notice) when missing. */
export async function readBaseDirents(baseDir: string, label: string): Promise<Dirent[]> {
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
