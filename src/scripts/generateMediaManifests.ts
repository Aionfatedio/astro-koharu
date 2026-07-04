/**
 * Generate manifests/metadata for local comics, music playlists, and videos.
 * Thin CLI orchestrator — the generators live in ./lib/.
 *
 * Usage:
 *   pnpm generate:media
 *   pnpm generate:media --force
 *   pnpm generate:media --target comics
 *   pnpm generate:media --target music
 *   pnpm generate:media --target videos
 */

import chalk from 'chalk';
import { runCloudLyricsGenerator } from './lib/cloud-lyrics-generator';
import { runComicGenerator } from './lib/comics-generator';
import { runMusicGenerator } from './lib/local-music-generator';
import { runVideoGenerator } from './lib/video-metadata-generator';

type MediaTarget = 'comics' | 'music' | 'videos';

const ALL_TARGETS: readonly MediaTarget[] = ['comics', 'music', 'videos'];

interface ParsedArgs {
  targets: MediaTarget[];
  force: boolean;
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

async function main(): Promise<void> {
  const { targets, force } = parseArgs();

  for (const target of targets) {
    if (target === 'comics') {
      await runComicGenerator(force);
    } else if (target === 'music') {
      await runMusicGenerator(force);
      await runCloudLyricsGenerator(force);
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
