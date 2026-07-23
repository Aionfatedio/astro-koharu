import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePlaylist } from './meting';

const originalFetch = globalThis.fetch;

test('reports an error when every playlist source fails', async () => {
  globalThis.fetch = async () => new Response('upstream unavailable', { status: 503 });

  try {
    await assert.rejects(resolvePlaylist(['https://music.163.com/song?id=1']), /Meting API error: 503/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps successful sources when another source fails', async () => {
  globalThis.fetch = async (input) => {
    if (String(input).includes('id=1')) {
      return new Response('upstream unavailable', { status: 503 });
    }
    return new Response(JSON.stringify([{ name: 'Track', artist: 'Artist', url: '/music/track.mp3', pic: '', lrc: '' }]), {
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const tracks = await resolvePlaylist(['https://music.163.com/song?id=1', 'https://music.163.com/song?id=2']);
    assert.deepEqual(tracks, [{ name: 'Track', artist: 'Artist', url: '/music/track.mp3', pic: '', lrc: '' }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
