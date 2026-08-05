import assert from 'node:assert/strict';
import test from 'node:test';
import { FRIENDS_DEFAULTS, normalizeFriendsConfig } from './friends';

test('an absent friends section resolves to defaults', () => {
  assert.deepEqual(normalizeFriendsConfig(undefined), FRIENDS_DEFAULTS);
  assert.deepEqual(normalizeFriendsConfig(null), FRIENDS_DEFAULTS);
});

test('intro defaults are applied per field', () => {
  const resolved = normalizeFriendsConfig({ intro: { title: '友链' } });
  assert.equal(resolved.intro.title, '友链');
  assert.equal(resolved.intro.applyTitle, FRIENDS_DEFAULTS.intro.applyTitle);
  assert.deepEqual(resolved.data, []);
});

test('friend links preserve valid optional colors', () => {
  const resolved = normalizeFriendsConfig({
    data: [
      {
        site: 'Example',
        url: 'https://example.com',
        owner: 'Owner',
        desc: 'Description',
        image: '/avatar.webp',
        color: '#fff',
      },
    ],
  });
  assert.equal(resolved.data[0]?.color, '#fff');
});

test('invalid friend records fail at the config boundary', () => {
  assert.throws(() => normalizeFriendsConfig({ data: {} } as never), /friends\.data must be an array/);
  assert.throws(
    () =>
      normalizeFriendsConfig({
        data: [{ site: '', url: 'https://example.com', owner: 'Owner', desc: 'Description', image: '/avatar.webp' }],
      }),
    /friends\.data\[0\]\.site/,
  );
});
