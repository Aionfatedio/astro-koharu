/**
 * PlayerPreview — vinyl disc with tonearm (left) + song info + centered lyrics (right).
 *
 * Supports both line-by-line and word-by-word lyrics:
 * - Line-by-line: original scroll + highlight (unchanged)
 * - Word-by-word: same scroll + per-word gradient fill via WordLrcRenderer
 */

import { usePlaybackLrcIndex } from '@hooks/usePlaybackTime';
import { type MetingSong, normalizeMetingResourceUrl } from '@lib/meting';
import type { PlaybackTimeStore } from '@lib/playback-time-store';
import { cn } from '@lib/utils';
import { memo, useEffect, useMemo, useState } from 'react';
import { detectLrcType, parseLrc, parseWordLrc } from './LrcParser';
import { WordLrcRenderer } from './WordLrcRenderer';

interface PlayerPreviewProps {
  track: MetingSong | null;
  playing: boolean;
  timeStore: PlaybackTimeStore;
  /** Line height in px — must match CSS `.audio-player-lrc p` height. @default 32 */
  lrcLineHeight?: number;
  /** Container height in px — must match CSS `.audio-player-lrc` height. @default 128 */
  lrcContainerHeight?: number;
}

/** Default line height and container height (match CSS values) */
const DEFAULT_LRC_LINE_HEIGHT = 32;
const DEFAULT_LRC_CONTAINER_HEIGHT = 128;

/** Resolve LRC: if it's a URL, fetch it; otherwise use as-is. */
function useLrcText(lrcSource: string | undefined): string {
  const [text, setText] = useState('');

  useEffect(() => {
    if (!lrcSource) {
      setText('');
      return;
    }

    // Local mod: normalize Meting URLs (http->https) and also fetch root-relative
    // paths — cloud lyrics live at /music/cloud-lyrics/*.lrc.
    const normalizedLrcSource = normalizeMetingResourceUrl(lrcSource);
    if (normalizedLrcSource.startsWith('http') || normalizedLrcSource.startsWith('/')) {
      const controller = new AbortController();
      fetch(normalizedLrcSource, { signal: controller.signal })
        .then((r) => r.text())
        .then(setText)
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === 'AbortError')) setText('');
        });
      return () => controller.abort();
    }

    setText(normalizedLrcSource);
  }, [lrcSource]);

  return text;
}

export const PlayerPreview = memo(function PlayerPreview({
  track,
  playing,
  timeStore,
  lrcLineHeight = DEFAULT_LRC_LINE_HEIGHT,
  lrcContainerHeight = DEFAULT_LRC_CONTAINER_HEIGHT,
}: PlayerPreviewProps) {
  const lrcText = useLrcText(track?.lrc);

  // Detect lyrics type and parse accordingly
  const lrcType = useMemo(() => detectLrcType(lrcText), [lrcText]);
  const lrcLines = useMemo(() => parseLrc(lrcText), [lrcText]);
  const wordLrcLines = useMemo(() => (lrcType === 'word' ? parseWordLrc(lrcText) : null), [lrcText, lrcType]);

  // Line index — works for both modes since WordLrcLine extends LrcLine
  const activeLrcLines = wordLrcLines ?? lrcLines;
  const currentLrcIndex = usePlaybackLrcIndex(timeStore, activeLrcLines);

  const lrcCenterOffset = (lrcContainerHeight - lrcLineHeight) / 2;

  return (
    <div className="audio-player-preview">
      {/* Disc wrapper: vinyl disc + tonearm */}
      <div className="audio-player-disc-wrapper">
        <div className={cn('audio-player-disc', playing && 'spinning')}>
          {track?.pic ? (
            <img src={track.pic} alt={track.name || ''} className="audio-player-cover" draggable={false} />
          ) : (
            <div className="audio-player-cover audio-player-cover-placeholder" />
          )}
        </div>
        <div className={cn('audio-player-needle', playing && 'playing')}>
          <div className="audio-player-needle-arm">
            <div className="audio-player-needle-head" />
          </div>
        </div>
      </div>

      {/* Song info + lyrics */}
      <div className="audio-player-info">
        <div className="audio-player-song-name" title={track?.name}>
          {track?.name || 'No track'}
        </div>
        <div className="audio-player-artist" title={track?.artist}>
          {track?.artist || ''}
        </div>

        {/* Word-by-word lyrics */}
        {wordLrcLines && wordLrcLines.length > 0 && (
          <WordLrcRenderer
            lines={wordLrcLines}
            currentIndex={currentLrcIndex}
            timeStore={timeStore}
            playing={playing}
            lrcLineHeight={lrcLineHeight}
            lrcContainerHeight={lrcContainerHeight}
          />
        )}

        {/* Line-by-line lyrics (original, unchanged) */}
        {!wordLrcLines && lrcLines.length > 0 && (
          <div className="audio-player-lrc">
            <div
              className="audio-player-lrc-inner"
              style={{
                transform: `translateY(${lrcCenterOffset - Math.max(0, currentLrcIndex) * lrcLineHeight}px)`,
              }}
            >
              {lrcLines.map((line, i) => (
                <p key={`${line.time}-${i}`} className={cn(i === currentLrcIndex && 'current')}>
                  {line.text || '\u00A0'}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
