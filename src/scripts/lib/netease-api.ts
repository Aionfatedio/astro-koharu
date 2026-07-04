/**
 * NetEase Cloud Music weapi client (build-time only).
 *
 * Implements the public `weapi` request encryption (AES-128-CBC x2 + RSA on a
 * random-less fixed secret) used by music.163.com web endpoints, plus the
 * YRC (word-level lyric) → enhanced-LRC conversion.
 */

import { createCipheriv } from 'node:crypto';

const REQUEST_TIMEOUT_MS = 10_000;
const NETEASE_REFERER = 'https://music.163.com/';

const NETEASE_MODULUS =
  '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7';
const NETEASE_NONCE = '0CoJUm6Qyw8W8jud';
const NETEASE_PUBKEY = '010001';
const NETEASE_IV = '0102030405060708';
const NETEASE_SECRET_KEY = '0123456789abcdef';

export interface NeteaseSong {
  id?: number | string;
  name?: string;
  ar?: { name?: string }[];
  artists?: { name?: string }[];
  dt?: number;
  duration?: number;
}

interface NeteasePlaylistResponse {
  playlist?: {
    trackIds?: { id?: number | string }[];
    tracks?: NeteaseSong[];
  };
}

interface NeteaseAlbumResponse {
  songs?: NeteaseSong[];
  album?: {
    songs?: NeteaseSong[];
  };
}

interface NeteaseSongDetailResponse {
  songs?: NeteaseSong[];
}

interface NeteaseLyricResponse {
  yrc?: {
    lyric?: string;
  };
}

async function fetchTextWithTimeout(url: string, init?: RequestInit): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function postForm(url: string, body: Record<string, string>, referer: string): Promise<string> {
  return fetchTextWithTimeout(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: referer,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    },
    body: new URLSearchParams(body),
  });
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let currentBase = base % modulus;
  let currentExponent = exponent;

  while (currentExponent > 0n) {
    if (currentExponent % 2n === 1n) result = (result * currentBase) % modulus;
    currentExponent /= 2n;
    currentBase = (currentBase * currentBase) % modulus;
  }

  return result;
}

function aesEncryptForNetease(value: string, secret: string): string {
  const cipher = createCipheriv('aes-128-cbc', Buffer.from(secret, 'utf8'), Buffer.from(NETEASE_IV, 'utf8'));
  return Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]).toString('base64');
}

function rsaEncryptForNetease(value: string): string {
  const reversedHex = Buffer.from([...value].reverse().join(''), 'utf8').toString('hex');
  return modPow(BigInt(`0x${reversedHex}`), BigInt(`0x${NETEASE_PUBKEY}`), BigInt(`0x${NETEASE_MODULUS}`))
    .toString(16)
    .padStart(256, '0')
    .slice(-256);
}

function prepareNeteaseWeapiBody(data: Record<string, unknown>): Record<string, string> {
  const raw = JSON.stringify(data);
  const firstPass = aesEncryptForNetease(raw, NETEASE_NONCE);
  return {
    params: aesEncryptForNetease(firstPass, NETEASE_SECRET_KEY),
    encSecKey: rsaEncryptForNetease(NETEASE_SECRET_KEY),
  };
}

async function fetchNeteaseWeapi<T>(url: string, data: Record<string, unknown>): Promise<T> {
  const text = await postForm(url, prepareNeteaseWeapiBody(data), NETEASE_REFERER);
  return JSON.parse(text) as T;
}

function normalizeNeteaseSongIds(values: (number | string | undefined)[]): number[] {
  return values.map((value) => Number(value)).filter((value) => Number.isSafeInteger(value) && value > 0);
}

async function fetchNeteaseSongDetails(songIds: number[]): Promise<NeteaseSong[]> {
  const songs: NeteaseSong[] = [];
  const batchSize = 100;

  for (let index = 0; index < songIds.length; index += batchSize) {
    const ids = songIds.slice(index, index + batchSize);
    const response = await fetchNeteaseWeapi<NeteaseSongDetailResponse>(
      'https://music.163.com/weapi/v3/song/detail?csrf_token=',
      {
        c: JSON.stringify(ids.map((id) => ({ id }))),
        ids: JSON.stringify(ids),
        csrf_token: '',
      },
    );
    songs.push(...(response.songs ?? []));
  }

  return songs;
}

/** Fetch songs for a Meting-style source type: 'playlist' | 'albumlist' | 'song'. */
export async function fetchNeteaseSongsByType(type: string, id: string): Promise<NeteaseSong[]> {
  if (type === 'playlist') {
    const response = await fetchNeteaseWeapi<NeteasePlaylistResponse>(
      'https://music.163.com/weapi/v6/playlist/detail?csrf_token=',
      {
        csrf_token: '',
        id,
        offset: '0',
        total: 'true',
        limit: '1000',
        n: '1000',
      },
    );
    const trackIds = normalizeNeteaseSongIds(response.playlist?.trackIds?.map((item) => item.id) ?? []);
    return trackIds.length > 0 ? await fetchNeteaseSongDetails(trackIds) : (response.playlist?.tracks ?? []);
  }

  if (type === 'albumlist') {
    const response = await fetchNeteaseWeapi<NeteaseAlbumResponse>(`https://music.163.com/weapi/v1/album/${id}?csrf_token=`, {
      csrf_token: '',
    });
    return response.songs ?? response.album?.songs ?? [];
  }

  if (type === 'song') {
    return fetchNeteaseSongDetails(normalizeNeteaseSongIds([id]));
  }

  return [];
}

function formatLrcTimestamp(ms: number): string {
  const totalMs = Math.max(0, Math.round(ms));
  const minutes = Math.floor(totalMs / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const milliseconds = totalMs % 1000;

  return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}]`;
}

function convertNeteaseYrcToWordLrc(yrc: string): string {
  const lines: string[] = [];

  for (const rawLine of yrc.split(/\r?\n/)) {
    const lineMatch = rawLine.trim().match(/^\[(\d+),(\d+)\](.*)$/);
    if (!lineMatch) continue;

    const lineStart = Number.parseInt(lineMatch[1], 10);
    const lineDuration = Number.parseInt(lineMatch[2], 10);
    const content = lineMatch[3];
    const wordMatches = Array.from(content.matchAll(/\((\d+),(\d+),\d+\)/g));
    if (wordMatches.length === 0) continue;

    let output = '';
    let previousText = '';
    for (let index = 0; index < wordMatches.length; index++) {
      const match = wordMatches[index];
      const matchEnd = (match.index ?? 0) + match[0].length;
      const nextMatchIndex = wordMatches[index + 1]?.index ?? content.length;
      let text = content.slice(matchEnd, nextMatchIndex);

      if (/[A-Za-z0-9]$/.test(previousText) && /^[A-Za-z0-9]/.test(text)) {
        text = ` ${text}`;
      }

      output += `${formatLrcTimestamp(Number.parseInt(match[1], 10))}${text}`;
      previousText = text;
    }

    lines.push(`${output}${formatLrcTimestamp(lineStart + lineDuration)}`);
  }

  return lines.join('\n');
}

/** Fetch word-level (YRC) lyrics converted to enhanced LRC; '' when unavailable. */
export async function fetchNeteaseWordLrc(songId: string): Promise<string> {
  const response = await fetchNeteaseWeapi<NeteaseLyricResponse>('https://music.163.com/weapi/song/lyric?csrf_token=', {
    id: songId,
    os: 'pc',
    lv: '-1',
    kv: '-1',
    tv: '-1',
    rv: '-1',
    yv: '-1',
    ytv: '-1',
    yrv: '-1',
    csrf_token: '',
  });

  return response.yrc?.lyric ? convertNeteaseYrcToWordLrc(response.yrc.lyric) : '';
}
