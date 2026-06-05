/**
 * WordLrcRenderer — single-element karaoke lyrics renderer.
 *
 * Each word is ONE <span class="lrc-word"> — no overlays, no ghosting.
 * JS sets CSS variable `--word-progress` (0%–100%) per word via rAF.
 * CSS renders the fill via `background-clip: text` + linear-gradient
 * with a 10% soft feather edge for Apple-Music-style sweep.
 *
 * Key: timeStore.getCurrentTime() only updates ~4/s (timeupdate events).
 * We interpolate between updates using performance.now() so that every
 * rAF frame (~60fps) advances smoothly — like a progress bar, not steps.
 */

import type { PlaybackTimeStore } from '@lib/playback-time-store';
import { cn } from '@lib/utils';
import { memo, useLayoutEffect, useRef } from 'react';
import type { WordLrcLine } from './LrcParser';

interface WordLrcRendererProps {
  lines: WordLrcLine[];
  currentIndex: number;
  timeStore: PlaybackTimeStore;
  lrcLineHeight: number;
  lrcContainerHeight: number;
}

export const WordLrcRenderer = memo(function WordLrcRenderer({
  lines,
  currentIndex,
  timeStore,
  lrcLineHeight,
  lrcContainerHeight,
}: WordLrcRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentIndexRef = useRef(currentIndex);
  const linesRef = useRef(lines);
  const centerOffset = (lrcContainerHeight - lrcLineHeight) / 2;

  currentIndexRef.current = currentIndex;
  linesRef.current = lines;

  // biome-ignore lint/correctness/useExhaustiveDependencies: currentIndex/lines intentionally trigger a DOM reset without restarting the rAF loop.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const lineElements = container.children;

    // On currentIndex change: batch-reset past/future lines once
    // Past lines → 0% (muted grey, NOT 100% which would be full highlight!)
    // Future lines → 0% (muted grey)
    for (let i = 0; i < lineElements.length; i++) {
      const spans = (lineElements[i] as HTMLElement).querySelectorAll<HTMLElement>('.lrc-word');
      for (const s of spans) s.style.setProperty('--word-progress', '0%');
    }
  }, [currentIndex, lines]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const lineElements = container.children;

    // Time interpolation state: bridge the ~250ms gaps between timeupdate events
    let lastStoreTime = timeStore.getCurrentTime();
    let lastPerfTime = performance.now();

    // Detect when timeStore actually pushes a new value
    const unsubscribe = timeStore.subscribe(() => {
      lastStoreTime = timeStore.getCurrentTime();
      lastPerfTime = performance.now();
    });

    let rafId: number;

    const tick = () => {
      // Interpolated time: last known audio time + elapsed wall-clock since then
      const now = performance.now();
      const delta = (now - lastPerfTime) / 1000; // seconds since last timeupdate
      const time = lastStoreTime + delta;
      const activeIndex = currentIndexRef.current;
      const activeLines = linesRef.current;

      const currentLineEl = lineElements[activeIndex] as HTMLElement | undefined;

      if (currentLineEl) {
        const lineData = activeLines[activeIndex];
        const wordSpans = currentLineEl.querySelectorAll<HTMLElement>('.lrc-word');

        if (lineData) {
          for (let j = 0; j < lineData.words.length; j++) {
            const span = wordSpans[j];
            if (!span) continue;

            const word = lineData.words[j];
            const elapsed = time - word.time;

            let percent: number;
            if (elapsed <= 0) {
              percent = 0;
            } else if (elapsed >= word.duration) {
              percent = 100;
            } else {
              percent = (elapsed / word.duration) * 100;
            }

            span.style.setProperty('--word-progress', `${percent.toFixed(3)}%`);
          }
        }
      }

      // Neighbour cleanup — guard against seek jumps
      // Past line → 0% (reset to muted grey)
      const prevEl = lineElements[activeIndex - 1] as HTMLElement | undefined;
      if (prevEl) {
        const spans = prevEl.querySelectorAll<HTMLElement>('.lrc-word');
        if (spans.length > 0 && spans[0].style.getPropertyValue('--word-progress') !== '0%') {
          for (const s of spans) s.style.setProperty('--word-progress', '0%');
        }
      }

      // Future line → 0% (stay muted grey)
      const nextEl = lineElements[activeIndex + 1] as HTMLElement | undefined;
      if (nextEl) {
        const spans = nextEl.querySelectorAll<HTMLElement>('.lrc-word');
        if (spans.length > 0 && spans[0].style.getPropertyValue('--word-progress') !== '0%') {
          for (const s of spans) s.style.setProperty('--word-progress', '0%');
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      unsubscribe();
    };
  }, [timeStore]);

  return (
    <div className="audio-player-lrc">
      <div
        className="audio-player-lrc-inner"
        ref={containerRef}
        style={{
          transform: `translate3d(0, ${centerOffset - Math.max(0, currentIndex) * lrcLineHeight}px, 0)`,
        }}
      >
        {lines.map((line, i) => (
          <p key={`${line.time}-${i}`} className={cn('lrc-word-line', i === currentIndex && 'current')}>
            {line.words.map((word) => (
              <span key={`${word.time}-${word.text}`} className="lrc-word">
                {word.text}
              </span>
            ))}
            {line.words.length === 0 && '\u00A0'}
          </p>
        ))}
      </div>
    </div>
  );
});
