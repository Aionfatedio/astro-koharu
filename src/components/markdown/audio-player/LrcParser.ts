/**
 * LRC lyrics parser.
 * Ported from Shoka player.js:477-511.
 *
 * Supports two modes:
 * 1. Line-by-line: [mm:ss.xx]lyrics text
 * 2. Word-by-word (Enhanced LRC):
 *    - Type A: [mm:ss.xx]<mm:ss.xx>word<mm:ss.xx>word...  (angle-bracket inline timestamps)
 *    - Type B: [mm:ss.xx]word[mm:ss.xx]word[mm:ss.xx]...  (bracket timestamps between characters)
 */

// ─── Line-by-line types & parser (original, unchanged) ───

export interface LrcLine {
  time: number; // seconds
  text: string;
}

const TIME_REGEX = /\[(\d+):(\d+)(?:\.(\d+))?\]/g;

export function parseLrc(lrcText: string): LrcLine[] {
  if (!lrcText) return [];

  const lines: LrcLine[] = [];

  for (const line of lrcText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const timestamps: number[] = [];
    let lastIndex = 0;

    for (let match = TIME_REGEX.exec(trimmed); match !== null; match = TIME_REGEX.exec(trimmed)) {
      const min = Number.parseInt(match[1], 10);
      const sec = Number.parseInt(match[2], 10);
      const ms = match[3] ? Number.parseInt(match[3].padEnd(3, '0'), 10) : 0;
      timestamps.push(min * 60 + sec + ms / 1000);
      lastIndex = match.index + match[0].length;
    }
    TIME_REGEX.lastIndex = 0;

    if (timestamps.length === 0) continue;

    const text = trimmed.slice(lastIndex).trim();
    for (const time of timestamps) {
      lines.push({ time, text });
    }
  }

  return lines.sort((a, b) => a.time - b.time);
}

// ─── Word-by-word types & parser ───

/** A single word/character with precise timing */
export interface LrcWord {
  time: number; // start time in seconds
  duration: number; // duration in seconds
  text: string;
}

/** A lyric line with per-word timing — extends LrcLine for compatibility with usePlaybackLrcIndex */
export interface WordLrcLine extends LrcLine {
  words: LrcWord[];
  endTime: number; // time + duration of last word
}

/** Timestamp pattern inside angle brackets: <mm:ss.xx> */
const ANGLE_TIME_REGEX = /<(\d+):(\d+)(?:\.(\d+))?>/g;

/** Parse a "mm:ss.xx" string to seconds */
function parseTimestamp(min: string, sec: string, ms?: string): number {
  return Number.parseInt(min, 10) * 60 + Number.parseInt(sec, 10) + (ms ? Number.parseInt(ms.padEnd(3, '0'), 10) / 1000 : 0);
}

/**
 * Detect whether LRC text contains word-level timestamps.
 *
 * Returns 'word' if angle-bracket timestamps (<mm:ss.xx>) are found
 * within lyric lines (not metadata lines like [ti:], [ar:], etc.),
 * or if bracket timestamps appear between characters on the same line.
 */
export function detectLrcType(lrcText: string): 'line' | 'word' {
  if (!lrcText) return 'line';

  for (const line of lrcText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip metadata lines: [ti:...], [ar:...], [al:...], [offset:...], [tool:...]
    if (/^\[[a-z]+:/i.test(trimmed)) continue;

    // Must start with a bracket timestamp
    if (!/^\[\d+:\d+/.test(trimmed)) continue;

    // Type A: angle-bracket timestamps within line content
    // After stripping leading [mm:ss.xx], check for <mm:ss.xx> in remaining text
    const afterBrackets = trimmed.replace(/^\[[\d:.]+\]/g, '');
    if (/<\d+:\d+[.\d]*>/.test(afterBrackets)) return 'word';

    // Type B: multiple bracket timestamps interleaved with text on same line
    // e.g. [00:14.15]眼[00:14.35]神[00:14.54]传
    // Count bracket timestamps and check if text appears between them
    const bracketMatches = trimmed.match(/\[\d+:\d+(?:\.\d+)?\]/g);
    if (bracketMatches && bracketMatches.length >= 3) {
      // Check that there's non-empty text between at least two consecutive timestamps
      const parts = trimmed.split(/\[\d+:\d+(?:\.\d+)?\]/);
      const textBetween = parts.filter((p) => p.trim().length > 0 && !/^[a-z]+:/i.test(p.trim()));
      if (textBetween.length >= 2) return 'word';
    }
  }

  return 'line';
}

/**
 * Parse word-by-word LRC into WordLrcLine[].
 * Supports both Type A (angle-bracket) and Type B (bracket-interleaved) formats.
 */
export function parseWordLrc(lrcText: string): WordLrcLine[] {
  if (!lrcText) return [];

  const lines: WordLrcLine[] = [];

  for (const rawLine of lrcText.split('\n')) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Skip metadata lines
    if (/^\[[a-z]+:/i.test(trimmed)) continue;

    // Extract leading [mm:ss.xx] line timestamp
    const lineTimeMatch = trimmed.match(/^\[(\d+):(\d+)(?:\.(\d+))?\]/);
    if (!lineTimeMatch) continue;

    const lineTime = parseTimestamp(lineTimeMatch[1], lineTimeMatch[2], lineTimeMatch[3]);
    const afterLineTimestamp = trimmed.slice(lineTimeMatch[0].length);

    // Determine format and parse words
    const words = parseTypeA(afterLineTimestamp, lineTime) || parseTypeB(afterLineTimestamp, lineTime);

    if (!words || words.length === 0) continue;

    const lastWord = words[words.length - 1];
    const fullText = words.map((w) => w.text).join('');

    lines.push({
      time: lineTime,
      text: fullText,
      words,
      endTime: lastWord.time + lastWord.duration,
    });
  }

  return lines.sort((a, b) => a.time - b.time);
}

/**
 * Parse Type A: <mm:ss.xx>word<mm:ss.xx>word...
 * Each angle-bracket timestamp marks the start of the following word.
 * Duration = next timestamp - current timestamp (last word extends to line end estimate).
 */
function parseTypeA(content: string, _lineTime: number): LrcWord[] | null {
  ANGLE_TIME_REGEX.lastIndex = 0;
  if (!ANGLE_TIME_REGEX.test(content)) return null;
  ANGLE_TIME_REGEX.lastIndex = 0;

  const timestamps: number[] = [];
  const textParts: string[] = [];
  let lastEnd = 0;

  for (let match = ANGLE_TIME_REGEX.exec(content); match !== null; match = ANGLE_TIME_REGEX.exec(content)) {
    // Text before this timestamp (may be empty)
    const textBefore = content.slice(lastEnd, match.index);
    if (textBefore && timestamps.length > 0) {
      textParts.push(textBefore);
    }
    timestamps.push(parseTimestamp(match[1], match[2], match[3]));
    lastEnd = match.index + match[0].length;
  }
  ANGLE_TIME_REGEX.lastIndex = 0;

  // Text after the last timestamp
  const trailing = content.slice(lastEnd);
  if (trailing) {
    textParts.push(trailing);
  }

  if (timestamps.length === 0 || textParts.length === 0) return null;

  // Build words: each timestamp[i] pairs with textParts[i]
  const words: LrcWord[] = [];
  for (let i = 0; i < textParts.length; i++) {
    const time = timestamps[i] ?? timestamps[timestamps.length - 1];
    const nextTime = timestamps[i + 1];
    // Duration: if next timestamp exists, use gap; otherwise estimate 0.5s
    const duration = nextTime !== undefined ? nextTime - time : 0.5;

    words.push({ time, duration: Math.max(0, duration), text: textParts[i] });
  }

  return words.length > 0 ? words : null;
}

/**
 * Parse Type B: word[mm:ss.xx]word[mm:ss.xx]word...
 * Bracket timestamps appear between characters. Each timestamp marks
 * the start of the NEXT word. First word starts at lineTime.
 */
function parseTypeB(content: string, lineTime: number): LrcWord[] | null {
  TIME_REGEX.lastIndex = 0;

  // Check if there are bracket timestamps within the content
  const hasInternalTimestamps = TIME_REGEX.test(content);
  TIME_REGEX.lastIndex = 0;
  if (!hasInternalTimestamps) return null;

  const timestamps: number[] = [lineTime];
  const textParts: string[] = [];
  let lastEnd = 0;

  for (let match = TIME_REGEX.exec(content); match !== null; match = TIME_REGEX.exec(content)) {
    const textBefore = content.slice(lastEnd, match.index);
    if (textBefore) textParts.push(textBefore);
    timestamps.push(parseTimestamp(match[1], match[2], match[3]));
    lastEnd = match.index + match[0].length;
  }
  TIME_REGEX.lastIndex = 0;

  // Trailing text after last timestamp
  const trailing = content.slice(lastEnd);
  if (trailing) textParts.push(trailing);

  if (textParts.length === 0) return null;

  const words: LrcWord[] = [];
  for (let i = 0; i < textParts.length; i++) {
    const time = timestamps[i] ?? timestamps[timestamps.length - 1];
    const nextTime = timestamps[i + 1];
    const duration = nextTime !== undefined ? nextTime - time : 0.5;
    words.push({ time, duration: Math.max(0, duration), text: textParts[i] });
  }

  return words.length > 0 ? words : null;
}
