import assert from 'node:assert/strict';
import test from 'node:test';

import { parseArgs } from './args';

test('parses migrate check mode without changing update check parsing', () => {
  const migrate = parseArgs(['migrate', '--check']);
  assert.equal(migrate.command, 'migrate');
  assert.equal(migrate.check, true);
  assert.equal(migrate.dryRun, false);

  const update = parseArgs(['update', '--check']);
  assert.equal(update.command, 'update');
  assert.equal(update.check, true);
});

test('does not consume a following flag as an option value', () => {
  const args = parseArgs(['generate', '--model', '--force', '--tag', '--check']);

  assert.equal(args.force, true);
  assert.equal(args.check, true);
  assert.equal(args.model, null);
  assert.equal(args.tag, null);
});

test('parses command-specific positional arguments and numeric keep', () => {
  const args = parseArgs(['generate', 'summaries', '--keep', '3', '--full']);

  assert.equal(args.command, 'generate');
  assert.equal(args.generateType, 'summaries');
  assert.equal(args.keep, 3);
  assert.equal(args.full, true);
});
