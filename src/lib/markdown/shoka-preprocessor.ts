/**
 * Shoka syntax preprocessor
 *
 * Transforms Shoka-specific syntax in raw Markdown BEFORE the remark parser
 * processes it. This is necessary because some Shoka syntax conflicts with
 * standard Markdown/GFM parsing:
 *
 * - `+++style Title` would be parsed as thematicBreak
 * - `~sub~` would be parsed as GFM strikethrough (~~ is delete)
 * - `{% links %}...{% endlinks %}` YAML content would be parsed as lists
 * - `:::style` is fine (remark sees it as paragraph text) but nested content
 *   with lists would be problematic
 *
 * This preprocessor converts block-level Shoka syntax into HTML before
 * remark parsing. Inline syntax (++ins++, ==mark==, !!spoiler!!, {^ruby})
 * is handled by remark plugins since those don't conflict with Markdown.
 */
import YAML from 'js-yaml';
import {
  escapeHtml,
  type FriendLinkData,
  type MediaItem,
  renderAudioMedia,
  renderFriendLinks,
  renderVideoMedia,
} from './shoka-renderers';

/* ── Admonition type mapping (Shoka → GitHub Alerts) ── */

const ADMONITION_MAP: Record<string, { type: string; label: string }> = {
  default: { type: 'quote', label: 'TIP' },
  info: { type: 'note', label: 'NOTE' },
  primary: { type: 'important', label: 'IMPORTANT' },
  success: { type: 'tip', label: 'SUCCESS' },
  warning: { type: 'warning', label: 'WARNING' },
  danger: { type: 'caution', label: 'CAUTION' },
};

const ADMONITION_SVGS: Record<string, string> = {
  tip: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="currentColor" d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69L5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0z"/><path fill="currentColor" d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0m-1.5 0a6.5 6.5 0 1 0-13 0a6.5 6.5 0 0 0 13 0"/></svg>',
  note: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>',
  important:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>',
  quote:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"/></svg>',
  warning:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>',
  caution:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4.47.22A.749.749 0 0 1 5 .22h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16.22H5a.749.749 0 0 1-.53-.22L.22 11.75A.749.749 0 0 1 0 11.22v-6c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>',
};

interface ContainerOptions {
  enableContainers?: boolean;
  enableHexoTags?: boolean;
}

/** Maximum nesting depth for recursive container processing */
const MAX_CONTAINER_DEPTH = 10;

/**
 * Process container syntax (:::, +++, ;;;) and Hexo tags in raw markdown text.
 * Returns the text with containers/tags replaced by HTML blocks.
 */
function processContainers(text: string, opts: ContainerOptions = {}, _depth = 0): string {
  // Guard against excessive nesting (malicious or accidental)
  if (_depth >= MAX_CONTAINER_DEPTH) return text;
  const containers = opts.enableContainers !== false;
  const hexoTags = opts.enableHexoTags !== false;
  const lines = text.split(/\r?\n/);
  const output: string[] = [];
  let i = 0;

  // Track tab groups for grouping consecutive ;;; with same id
  let pendingTabId: string | null = null;
  let pendingTabs: { name: string; lines: string[] }[] = [];

  function flushTabs() {
    if (pendingTabs.length === 0 || !pendingTabId) return;
    const groupId = pendingTabId;

    output.push('');
    output.push(`<div class="tab-group" data-tab-group="${escapeHtml(groupId)}">`);
    output.push(`<div class="tab-headers" role="tablist">`);
    for (let t = 0; t < pendingTabs.length; t++) {
      const isActive = t === 0;
      output.push(
        `<button class="tab-header" role="tab" aria-selected="${isActive}" data-tab-index="${t}" data-tab-group="${escapeHtml(groupId)}">${escapeHtml(pendingTabs[t].name)}</button>`,
      );
    }
    output.push('</div>');
    for (let t = 0; t < pendingTabs.length; t++) {
      const isActive = t === 0;
      output.push(`<div class="tab-panel${isActive ? ' active' : ''}" role="tabpanel" data-tab-index="${t}">`);
      output.push('');
      // Recursively process inner content
      output.push(processContainers(pendingTabs[t].lines.join('\n'), opts, _depth + 1));
      output.push('');
      output.push('</div>');
    }
    output.push('</div>');
    output.push('');

    pendingTabs = [];
    pendingTabId = null;
  }

  // Track code fences to avoid processing container syntax inside them
  let inCodeFence = false;
  let codeFenceChar = '';
  let codeFenceLen = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Detect code fence boundaries (``` or ~~~ with 3+ chars)
    const fenceMatch = line.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const matchChar = fenceMatch[1][0];
      const matchLen = fenceMatch[1].length;
      if (!inCodeFence) {
        inCodeFence = true;
        codeFenceChar = matchChar;
        codeFenceLen = matchLen;
        flushTabs();
        output.push(line);
        i++;
        continue;
      }
      // Closing fence: same char, at least same length, only whitespace after
      if (matchChar === codeFenceChar && matchLen >= codeFenceLen && /^(`{3,}|~{3,})\s*$/.test(line)) {
        inCodeFence = false;
        codeFenceChar = '';
        codeFenceLen = 0;
        output.push(line);
        i++;
        continue;
      }
    }

    // Inside code fence → pass through unchanged
    if (inCodeFence) {
      output.push(line);
      i++;
      continue;
    }

    // ::: note block
    const noteMatch = containers && line.match(/^:::(\w+)(?:\s+(no-icon))?\s*$/);
    if (noteMatch) {
      flushTabs();
      const style = noteMatch[1];
      const noIcon = noteMatch[2] === 'no-icon';
      const innerLines: string[] = [];
      i++;
      let depth = 1;
      while (i < lines.length && depth > 0) {
        if (/^:::\s*$/.test(lines[i])) {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        } else if (/^:::(\w+)(?:\s+(no-icon))?\s*$/.test(lines[i])) {
          depth++;
        }
        innerLines.push(lines[i]);
        i++;
      }

      const innerContent = processContainers(innerLines.join('\n'), opts, _depth + 1);
      const mapped = ADMONITION_MAP[style];

      if (noIcon || !mapped) {
        // no-icon or unknown type: keep original div output
        const noIconClass = noIcon ? ' no-icon' : '';
        output.push('');
        output.push(`<div class="note-block note-${style}${noIconClass}">`);
        output.push('');
        output.push(innerContent);
        output.push('');
        output.push('</div>');
        output.push('');
      } else {
        // Admonition: GitHub Alerts style blockquote with inline SVG
        const svg = ADMONITION_SVGS[mapped.type];
        output.push('');
        output.push(`<blockquote class="admonition bdm-${mapped.type}">`);
        output.push(`<span class="bdm-title">${svg} ${mapped.label}</span>`);
        output.push('');
        output.push(innerContent);
        output.push('');
        output.push('</blockquote>');
        output.push('');
      }
      continue;
    }

    // +++ collapse block
    const collapseMatch = containers && line.match(/^\+\+\+(\w+)\s+(.+)$/);
    if (collapseMatch) {
      flushTabs();
      const style = collapseMatch[1];
      const title = collapseMatch[2];
      const innerLines: string[] = [];
      i++;
      let depth = 1;
      while (i < lines.length && depth > 0) {
        if (/^\+\+\+\s*$/.test(lines[i])) {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        } else if (/^\+\+\+\w+\s+.+$/.test(lines[i])) {
          depth++;
        }
        innerLines.push(lines[i]);
        i++;
      }
      output.push('');
      output.push(`<details class="collapse-block collapse-${style}">`);
      output.push(`<summary>${escapeHtml(title)}</summary>`);
      output.push(`<div class="collapse-content">`);
      output.push('');
      output.push(processContainers(innerLines.join('\n'), opts, _depth + 1));
      output.push('');
      output.push('</div>');
      output.push('</details>');
      output.push('');
      continue;
    }

    // ;;; tab panel
    const tabMatch = containers && line.match(/^;;;(\S+)\s+(.+)$/);
    if (tabMatch) {
      const tabId = tabMatch[1];
      const tabName = tabMatch[2];
      const innerLines: string[] = [];
      i++;
      let depth = 1;
      while (i < lines.length && depth > 0) {
        if (/^;;;\s*$/.test(lines[i])) {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        } else if (/^;;;\S+\s+.+$/.test(lines[i])) {
          depth++;
        }
        innerLines.push(lines[i]);
        i++;
      }

      if (pendingTabId === tabId) {
        pendingTabs.push({ name: tabName, lines: innerLines });
      } else {
        flushTabs();
        pendingTabId = tabId;
        pendingTabs = [{ name: tabName, lines: innerLines }];
      }
      continue;
    }

    // {% links %} ... {% endlinks %}
    if (hexoTags && line.trim() === '{% links %}') {
      flushTabs();
      const yamlLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '{% endlinks %}') {
        yamlLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip endlinks

      try {
        const data = YAML.load(yamlLines.join('\n')) as FriendLinkData[];
        if (Array.isArray(data)) {
          output.push('');
          output.push(renderFriendLinks(data));
          output.push('');
        }
      } catch {
        output.push(`<!-- Failed to parse links YAML -->`);
      }
      continue;
    }

    // {% media audio/video %} ... {% endmedia %}
    const mediaMatch = hexoTags && line.trim().match(/^{% media (audio|video) %}$/);
    if (mediaMatch) {
      flushTabs();
      const mediaType = mediaMatch[1];
      const yamlLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '{% endmedia %}') {
        yamlLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip endmedia

      try {
        const data = YAML.load(yamlLines.join('\n')) as MediaItem[];
        if (Array.isArray(data)) {
          if (mediaType === 'audio') {
            output.push('');
            output.push(renderAudioMedia(data));
            output.push('');
          } else {
            output.push('');
            output.push(renderVideoMedia(data));
            output.push('');
          }
        }
      } catch {
        output.push(`<!-- Failed to parse media YAML -->`);
      }
      continue;
    }

    // Don't flush pending tabs on empty lines — consecutive ;;; blocks
    // are separated by blank lines but should still group together.
    if (pendingTabId && line.trim() === '') {
      i++;
      continue;
    }
    flushTabs();
    output.push(line);
    i++;
  }

  flushTabs();
  return output.join('\n');
}

/**
 * Process escaped Shoka delimiters (\++, \==, \!!) by inserting HTML comments
 * to break token pairing. Must run before remark parsing since `\` escapes
 * are consumed by the Markdown parser before remark plugins see the text.
 *
 * `\++` or `\+\+` → `+<!-- -->+` (breaks ++ token matching, renders as ++)
 */
function processEscapedDelimiters(text: string): string {
  // Per-character escapes (\+\+, \=\=, \!\!) must run before delimiter escapes
  // (\++, \==, \!!) to avoid partial matches leaving a dangling backslash
  text = text.replace(/\\([+=!])\\\1/g, '$1<!-- -->$1');
  text = text.replace(/\\([+=!])\1(?!\1)/g, '$1<!-- -->$1');
  return text;
}

/**
 * Process inline ~sub~ and ^sup^ syntax, skipping protected regions.
 * Must be done before GFM parsing to avoid ~text~ being treated as strikethrough.
 */
function processInlineSuperSub(text: string): string {
  return processOutsideProtectedRegions(text, (segment) => {
    // Replace ~sub~ (single tilde, not ~~) with <sub> — escape content to prevent XSS
    segment = segment.replace(/(?<![~\\])~([^~\s]+)~(?!~)/g, (_, content) => `<sub>${escapeHtml(content)}</sub>`);
    // Replace ^sup^ with <sup> — escape content to prevent XSS
    segment = segment.replace(/(?<![\\^])\^([^^\s]+)\^/g, (_, content) => `<sup>${escapeHtml(content)}</sup>`);
    return segment;
  });
}

/**
 * Split text into protected and unprotected segments, applying `fn` only to unprotected parts.
 * Protected regions: code fences (```/~~~), inline code (`...`), math ($$...$$, $...$).
 */
function processOutsideProtectedRegions(text: string, fn: (segment: string) => string): string {
  // Match (in priority order): code fences, inline code, block math, inline math
  const protectedRegex =
    /(^`{3,}.*\n[\s\S]*?^`{3,}\s*$|^~{3,}.*\n[\s\S]*?^~{3,}\s*$|`[^`\n]+`|\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/gm;
  let lastIndex = 0;
  const parts: string[] = [];

  for (let match = protectedRegex.exec(text); match !== null; match = protectedRegex.exec(text)) {
    if (match.index > lastIndex) {
      parts.push(fn(text.slice(lastIndex, match.index)));
    }
    parts.push(match[0]);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(fn(text.slice(lastIndex)));
  }

  return parts.length > 0 ? parts.join('') : fn(text);
}

/**
 * Main preprocessor function.
 * Transforms raw Markdown source text before remark parsing.
 */
export function preprocessShokaSyntax(
  source: string,
  options?: {
    enableContainers?: boolean;
    enableHexoTags?: boolean;
    enableSuperSub?: boolean;
  },
): string {
  let result = source;

  // Process block-level containers and Hexo tags
  if (options?.enableContainers !== false || options?.enableHexoTags !== false) {
    result = processContainers(result, {
      enableContainers: options?.enableContainers,
      enableHexoTags: options?.enableHexoTags,
    });
  }

  // Process escaped delimiters before remark parsing consumes backslashes
  result = processOutsideProtectedRegions(result, processEscapedDelimiters);

  // Process inline sub/sup before GFM strikethrough conflicts
  if (options?.enableSuperSub !== false) {
    result = processInlineSuperSub(result);
  }

  return result;
}
