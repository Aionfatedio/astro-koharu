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
import { memo, useCallback, useLayoutEffect, useRef } from 'react';
import type { WordLrcLine } from './LrcParser';

interface WordLrcRendererProps {
  lines: WordLrcLine[];
  currentIndex: number;
  timeStore: PlaybackTimeStore;
  /** Whether audio is currently playing. Pauses time interpolation when false. */
  playing: boolean;
  lrcLineHeight: number;
  lrcContainerHeight: number;
}

/** Keep the highlight front edge at this fraction of the visible width before scrolling. */
const HORIZONTAL_ANCHOR = 0.82;

export const WordLrcRenderer = memo(function WordLrcRenderer({
  lines,
  currentIndex,
  timeStore,
  playing,
  lrcLineHeight,
  lrcContainerHeight,
}: WordLrcRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentIndexRef = useRef(currentIndex);
  const linesRef = useRef(lines);
  const playingRef = useRef(playing);
  // Cached horizontal-scroll metrics for the current line — measured on line change
  // so the rAF loop never forces a reflow (transform reads/writes stay in layout space).
  const wordMetricsRef = useRef<{ left: number; width: number }[]>([]);
  const lineScrollRef = useRef<{ visibleWidth: number; maxShift: number }>({ visibleWidth: 0, maxShift: 0 });
  // Per-line `.lrc-word` span arrays, rebuilt on line/lines change — the rAF loop
  // must not run querySelectorAll every frame.
  const allSpansRef = useRef<HTMLElement[][]>([]);
  const centerOffset = (lrcContainerHeight - lrcLineHeight) / 2;

  currentIndexRef.current = currentIndex;
  linesRef.current = lines;
  playingRef.current = playing;

  // Measure the current line for horizontal karaoke scrolling. Stable identity
  // (reads via refs) so both the line-change effect and the ResizeObserver share it.
  const remeasureCurrentLine = useCallback(() => {
    const container = containerRef.current;
    const curEl = container?.children[currentIndexRef.current] as HTMLElement | undefined;
    const spans = allSpansRef.current[currentIndexRef.current];
    if (!container || !curEl || !spans) {
      wordMetricsRef.current = [];
      lineScrollRef.current = { visibleWidth: 0, maxShift: 0 };
      return;
    }

    const metrics: { left: number; width: number }[] = [];
    for (const s of spans) metrics.push({ left: s.offsetLeft, width: s.offsetWidth });
    wordMetricsRef.current = metrics;

    const visibleWidth = container.clientWidth;
    const last = metrics[metrics.length - 1];
    const lineWidth = last ? last.left + last.width : 0;
    const maxShift = Math.max(0, lineWidth - visibleWidth);
    lineScrollRef.current = { visibleWidth, maxShift };

    // Only lines that actually overflow scroll horizontally. Short lines keep the
    // default per-line transition (smooth row-to-row scale/opacity) untouched.
    curEl.classList.toggle('is-scrolling', maxShift > 0);
    if (maxShift === 0) curEl.style.transform = '';
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: currentIndex/lines intentionally trigger a DOM reset without restarting the rAF loop.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const lineElements = container.children;

    // On currentIndex change: batch-reset past/future lines once
    // Past lines → 0% (muted grey, NOT 100% which would be full highlight!)
    // Future lines → 0% (muted grey)
    // Also clear horizontal scroll (transform + .is-scrolling) from the previous line,
    // and rebuild the per-line span cache (DOM may have re-rendered on lines change).
    const allSpans: HTMLElement[][] = [];
    for (let i = 0; i < lineElements.length; i++) {
      const el = lineElements[i] as HTMLElement;
      const spans = Array.from(el.querySelectorAll<HTMLElement>('.lrc-word'));
      allSpans.push(spans);
      for (const s of spans) s.style.setProperty('--word-progress', '0%');
      el.style.transform = '';
      el.classList.remove('is-scrolling');
    }
    allSpansRef.current = allSpans;

    remeasureCurrentLine();
  }, [currentIndex, lines]);

  // Cached metrics go stale when the container resizes (window resize, font swap,
  // player layout changes) — re-measure so long lines don't mis-scroll or clip.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(remeasureCurrentLine);
    observer.observe(container);
    return () => observer.disconnect();
  }, [remeasureCurrentLine]);

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
      // Interpolated time: last known audio time + elapsed wall-clock since then.
      // While paused/stopped, pin the clock so the fill never advances on its own
      // (fixes the phantom left-to-right sweep of line 1 before playback starts).
      const now = performance.now();
      if (!playingRef.current) lastPerfTime = now;
      const delta = (now - lastPerfTime) / 1000; // seconds since last timeupdate
      const time = lastStoreTime + delta;
      const activeIndex = currentIndexRef.current;
      const activeLines = linesRef.current;

      const currentLineEl = lineElements[activeIndex] as HTMLElement | undefined;

      if (currentLineEl) {
        const lineData = activeLines[activeIndex];
        const wordSpans = allSpansRef.current[activeIndex] ?? [];
        const metrics = wordMetricsRef.current;
        const scroll = lineScrollRef.current;
        const needsScroll = scroll.maxShift > 0;

        // x-coordinate of the highlight front edge, for horizontal scrolling
        let frontEdge = 0;
        let frontResolved = false;

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

            // Advance the front edge along the sung words. Fully-sung words push it to
            // their right edge; the first partially-sung word interpolates by percent;
            // once an un-started word is reached, the front is settled.
            if (needsScroll && !frontResolved) {
              const m = metrics[j];
              if (percent >= 100) {
                if (m) frontEdge = m.left + m.width;
              } else if (percent > 0) {
                if (m) frontEdge = m.left + m.width * (percent / 100);
                frontResolved = true;
              } else {
                frontResolved = true;
              }
            }
          }
        }

        // Horizontal karaoke scroll: keep the highlight front near the anchor point,
        // clamped so the line never scrolls past its start or end.
        if (needsScroll) {
          let shift = frontEdge - scroll.visibleWidth * HORIZONTAL_ANCHOR;
          if (shift < 0) shift = 0;
          else if (shift > scroll.maxShift) shift = scroll.maxShift;
          currentLineEl.style.transform = shift > 0 ? `translateX(${-shift}px)` : '';
        }
      }

      // Neighbour cleanup — guard against seek jumps
      // Past line → 0% (reset to muted grey)
      const prevSpans = allSpansRef.current[activeIndex - 1];
      if (prevSpans && prevSpans.length > 0 && prevSpans[0].style.getPropertyValue('--word-progress') !== '0%') {
        for (const s of prevSpans) s.style.setProperty('--word-progress', '0%');
      }

      // Future line → 0% (stay muted grey)
      const nextSpans = allSpansRef.current[activeIndex + 1];
      if (nextSpans && nextSpans.length > 0 && nextSpans[0].style.getPropertyValue('--word-progress') !== '0%') {
        for (const s of nextSpans) s.style.setProperty('--word-progress', '0%');
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
