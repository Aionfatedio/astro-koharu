import assert from 'node:assert/strict';
import test from 'node:test';
import { isOpenInEditorAvailable, normalizePostActionsConfig, POST_ACTIONS_DEFAULTS } from './post-actions';

test('post actions apply field defaults and validate modes', () => {
  assert.deepEqual(normalizePostActionsConfig(undefined), POST_ACTIONS_DEFAULTS);
  assert.deepEqual(normalizePostActionsConfig({ copyMarkdown: false, openInEditor: 'everyone' }), {
    copyMarkdown: false,
    downloadMarkdown: true,
    openInEditor: 'everyone',
  });
  assert.throws(() => normalizePostActionsConfig({ openInEditor: true }), /must be one of/);
  assert.throws(() => normalizePostActionsConfig({ downloadMarkdown: 'no' }), /must be a boolean/);
  assert.throws(() => normalizePostActionsConfig([]), /must be an object/);
});

test('open in writing room needs the editor and respects the mode', () => {
  const everyone = normalizePostActionsConfig({ openInEditor: 'everyone' });
  const dev = normalizePostActionsConfig({ openInEditor: 'dev' });
  const off = normalizePostActionsConfig({ openInEditor: 'off' });
  assert.equal(isOpenInEditorAvailable(everyone, false, true), false);
  assert.equal(isOpenInEditorAvailable(everyone, true, false), true);
  assert.equal(isOpenInEditorAvailable(dev, true, false), false);
  assert.equal(isOpenInEditorAvailable(dev, true, true), true);
  assert.equal(isOpenInEditorAvailable(off, true, true), false);
});
