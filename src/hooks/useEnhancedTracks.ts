/**
 * useEnhancedTracks — enhances local music tracks with ID3 metadata at runtime.
 *
 * For tracks missing name/artist/pic, attempts to extract metadata from the
 * audio file's embedded tags (ID3v2, Vorbis, etc.) using Range requests.
 *
 * Enhancement happens lazily in the background without blocking playback.
 * Only local tracks (URL starting with "/music/") are candidates for enhancement.
 */

import { enhanceTrackMetadata } from '@lib/audio-metadata';
import type { MetingSong } from '@lib/meting';
import { useEffect, useState } from 'react';

/** Check if a track is from a local playlist and needs metadata enhancement */
function needsEnhancement(track: MetingSong): boolean {
  if (!track.url.startsWith('/music/')) return false;
  return !track.name || !track.artist || !track.pic;
}

export function useEnhancedTracks(rawTracks: MetingSong[]): MetingSong[] {
  const [tracks, setTracks] = useState<MetingSong[]>(rawTracks);

  useEffect(() => {
    // Reset to raw tracks immediately when input changes
    setTracks(rawTracks);

    if (rawTracks.length === 0) return;

    // Find tracks that need enhancement
    const candidates = rawTracks.map((track, index) => ({ track, index })).filter(({ track }) => needsEnhancement(track));

    if (candidates.length === 0) return;

    let cancelled = false;

    // Enhance tracks one by one to avoid burst of Range requests
    async function enhanceAll() {
      for (const { track, index } of candidates) {
        if (cancelled) break;

        const enhanced = await enhanceTrackMetadata(track);
        if (cancelled) break;

        // Only update if something actually changed
        if (enhanced !== track) {
          setTracks((prev) => {
            const next = [...prev];
            next[index] = enhanced;
            return next;
          });
        }
      }
    }

    enhanceAll();
    return () => {
      cancelled = true;
    };
  }, [rawTracks]);

  return tracks;
}
