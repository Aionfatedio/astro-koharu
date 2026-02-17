/**
 * Runtime audio metadata extraction using music-metadata + @tokenizer/http.
 *
 * Uses HTTP Range requests to read only the file header (ID3v2 tags),
 * avoiding downloading the entire audio file.
 *
 * Designed for local audio files — enhances MetingSong entries that have
 * missing name/artist/pic fields by reading embedded ID3/Vorbis tags.
 */

import type { MetingSong } from './meting';

interface ExtractedMetadata {
  name: string;
  artist: string;
  pic: string;
}

// In-flight request deduplication: prevent multiple extractions for the same URL
const pendingExtractions = new Map<string, Promise<ExtractedMetadata | null>>();

// Cache extracted metadata to avoid redundant Range requests
const metadataCache = new Map<string, ExtractedMetadata | null>();

/**
 * Extract metadata (title, artist, cover art) from an audio file URL
 * using HTTP Range requests — only downloads the bytes needed for tags.
 *
 * Returns null if extraction fails (network error, unsupported format, etc.)
 */
async function extractMetadataImpl(audioUrl: string): Promise<ExtractedMetadata | null> {
  try {
    // Dynamic imports — zero cost for users who don't use local playlists
    const [{ makeTokenizer }, { parseFromTokenizer }] = await Promise.all([
      import('@tokenizer/http'),
      import('music-metadata'),
    ]);

    // @tokenizer/http uses RFC-7233 Range requests automatically,
    // only downloading the byte ranges that music-metadata requests
    const tokenizer = await makeTokenizer(audioUrl);
    const metadata = await parseFromTokenizer(tokenizer, {
      skipPostHeaders: true, // skip tags at end of file (ID3v1) to reduce reads
    });

    let pic = '';
    const picture = metadata.common.picture?.[0];
    if (picture) {
      const blob = new Blob([picture.data], { type: picture.format });
      pic = URL.createObjectURL(blob);
    }

    return {
      name: metadata.common.title || '',
      artist: metadata.common.artist || '',
      pic,
    };
  } catch {
    return null;
  }
}

/**
 * Extract metadata for an audio URL, with caching and deduplication.
 */
export async function extractAudioMetadata(audioUrl: string): Promise<ExtractedMetadata | null> {
  // Check cache first
  if (metadataCache.has(audioUrl)) {
    return metadataCache.get(audioUrl) ?? null;
  }

  // Deduplicate concurrent requests for the same URL
  const pending = pendingExtractions.get(audioUrl);
  if (pending) return pending;

  const promise = extractMetadataImpl(audioUrl).then((result) => {
    metadataCache.set(audioUrl, result);
    pendingExtractions.delete(audioUrl);
    return result;
  });

  pendingExtractions.set(audioUrl, promise);
  return promise;
}

/**
 * Enhance a MetingSong track with extracted metadata.
 *
 * Fallback priority (per field):
 *   1. manifest.json value (already in track) — highest priority
 *   2. Extracted ID3/Vorbis tag value — runtime enhancement
 *   3. Existing fallback (empty string) — player handles gracefully
 *
 * Only triggers extraction if at least one field (name/artist/pic) is empty.
 */
export async function enhanceTrackMetadata(track: MetingSong): Promise<MetingSong> {
  const needsName = !track.name;
  const needsArtist = !track.artist;
  const needsPic = !track.pic;

  // All fields already filled — skip extraction entirely
  if (!needsName && !needsArtist && !needsPic) return track;

  const extracted = await extractAudioMetadata(track.url);
  if (!extracted) return track;

  return {
    ...track,
    name: needsName && extracted.name ? extracted.name : track.name,
    artist: needsArtist && extracted.artist ? extracted.artist : track.artist,
    pic: needsPic && extracted.pic ? extracted.pic : track.pic,
  };
}
