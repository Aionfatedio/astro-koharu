import sanitizeHtml from 'sanitize-html';

const INVALID_XML_CHARACTERS =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentional - filtering invalid XML characters
  /[^\x09\x0A\x0D\x20-\xFF\x85\xA0-\uD7FF\uE000-\uFDCF\uFDE0-\uFFFD\u{10000}-\u{10FFFF}]/gu;

const cleanInvalidXmlCharacters = (text: string) => text.replace(INVALID_XML_CHARACTERS, '');

export const getSanitizeHtml = (html: string) => {
  return sanitizeHtml(html, {
    // https://stackoverflow.com/questions/12229572/php-generated-xml-shows-invalid-char-value-27-message
    textFilter: cleanInvalidXmlCharacters,
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
  });
};

const KOHARU_CONTENT_TAGS = ['a', 'blockquote', 'code', 'em', 'pre', 's', 'spoiler-span', 'strong', 'u'] as const;

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

const KOHARU_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tg:']);

function safeKoharuHref(value?: string): string | undefined {
  if (!value || value.trim() !== value) return undefined;
  const href = value;
  for (const character of href) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return undefined;
  }
  try {
    const url = new URL(href);
    if (!KOHARU_LINK_PROTOCOLS.has(url.protocol)) return undefined;
    if ((url.protocol === 'http:' || url.protocol === 'https:') && (url.username || url.password)) return undefined;
    return href;
  } catch {
    return undefined;
  }
}

interface SanitizeKoharuContentOptions {
  interactiveSpoilers?: boolean;
}

/**
 * Normalize Koharu Suite rich text for rendering in Moments and RSS.
 *
 * Suite HTML is external input even when it comes from a configured instance,
 * so only Telegram formatting emitted by the public API is retained. Telegram
 * spoilers are adapted to the same web component used by Shoka markdown
 * content. Newline text nodes remain unchanged so the Moments renderer can
 * preserve them without corrupting block structure.
 */
export function sanitizeKoharuContentHtml(
  html?: string | null,
  plainText?: string | null,
  options: SanitizeKoharuContentOptions = {},
): string {
  const richHtml = html?.trim() ? html : undefined;
  const source = richHtml ?? (plainText ? escapeHtml(plainText) : '');
  if (!source) return '';

  const normalizedSource = source.replace(/\r\n?/g, '\n');
  const interactiveSpoilers = options.interactiveSpoilers ?? true;
  return sanitizeHtml(normalizedSource, {
    allowedTags: [...KOHARU_CONTENT_TAGS],
    allowedAttributes: {
      a: ['href', 'rel'],
      blockquote: ['class'],
      code: ['class'],
    },
    allowedClasses: {
      blockquote: ['tg-expandable-blockquote'],
      code: [/^language-[A-Za-z0-9_+-]{1,64}$/],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tg'],
    allowedSchemesAppliedToAttributes: ['href'],
    allowProtocolRelative: false,
    enforceHtmlBoundary: true,
    transformTags: {
      a: (_tagName, attributes) => {
        const href = safeKoharuHref(attributes.href);
        const attribs: Record<string, string> = {};
        if (href) {
          attribs.href = href;
          attribs.rel = 'nofollow noopener noreferrer';
        }
        return {
          tagName: 'a',
          attribs,
        };
      },
      span: (_tagName, attributes) => {
        return attributes.class === 'tg-spoiler'
          ? { tagName: interactiveSpoilers ? 'spoiler-span' : 'span', attribs: {} }
          : { tagName: 'span', attribs: {} };
      },
      'spoiler-span': () => ({ tagName: 'span', attribs: {} }),
    },
    exclusiveFilter: (frame) => (frame.tag === 'a' && !frame.attribs.href ? 'excludeTag' : false),
    textFilter: cleanInvalidXmlCharacters,
  });
}

/** Use a visible, non-interactive spoiler fallback in feed readers. */
export function sanitizeKoharuRssContentHtml(html?: string | null, plainText?: string | null): string {
  return sanitizeKoharuContentHtml(html, plainText, { interactiveSpoilers: false });
}

/**
 * Strip all HTML tags and return plain text, truncated to maxLength.
 * Used by RSS feeds to generate <description> from rendered HTML.
 */
export function stripHtmlToText(html: string, maxLength: number = 150): string {
  const text = sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
    textFilter: cleanInvalidXmlCharacters,
  });
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).replace(/\s+\S*$/, '');
}

/**
 * 从 Markdown 内容中提取纯文本，用于生成 OG 描述。
 * 同步实现（被 .astro frontmatter 与内容转换层同步调用），逐行扫描：
 * 跳过 front matter、围栏代码块、::: 容器内容、表格行，并剥离行内 Markdown 标记。
 * @param content Markdown 内容字符串
 * @param maxLength 最大长度，默认 150 字符
 * @returns 提取的纯文本
 */
export const extractTextFromMarkdown = (content: string, maxLength: number = 150): string => {
  if (!content) return '';

  // Strip YAML front matter (--- ... ---)
  let body = content;
  if (body.startsWith('---')) {
    const closing = body.indexOf('\n---', 3);
    if (closing !== -1) {
      const afterClosing = body.indexOf('\n', closing + 1);
      body = afterClosing !== -1 ? body.slice(afterClosing + 1) : '';
    }
  }

  const targetLen = maxLength + 50;
  const collected: string[] = [];
  let collectedLen = 0;
  let inCodeBlock = false;
  let containerDepth = 0;

  for (const rawLine of body.split('\n')) {
    if (collectedLen >= targetLen) break;
    const line = rawLine.trim();
    if (!line) continue;

    // Fenced code block toggle (```); skip everything inside
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // ::: container directives (admonitions, encrypted blocks, …):
    // `:::name` opens, a lone `:::` closes. Skip their contents entirely.
    if (line.startsWith(':::')) {
      if (line.length > 3) containerDepth++;
      else if (containerDepth > 0) containerDepth--;
      continue;
    }
    if (containerDepth > 0) continue;

    // Skip table rows ('|') and lone ':' lines (definition-list / dangling colon)
    if (line.startsWith('|') || line.startsWith(':')) continue;

    const processed = processLine(line);
    if (processed.length >= 3) {
      collected.push(processed);
      collectedLen += processed.length + 1;
    }
  }

  let result = collected.join(' ');

  // Smart truncation: back off to the previous space within the last 20%
  if (result.length > maxLength) {
    let cut = maxLength;
    const minCut = Math.floor(maxLength * 0.8);
    while (cut > minCut && result[cut] !== ' ') cut--;
    result = `${result.slice(0, cut)}...`;
  }

  return result;
};

/**
 * 剥离单行 Markdown 的块级前缀与行内标记，返回纯文本。
 */
function processLine(line: string): string {
  const withoutPrefix = line
    .replace(/^#{1,6}\s+/, '') // headings
    .replace(/^[-*+]\s+/, '') // unordered list bullets
    .replace(/^>\s*/, '') // blockquote markers
    .replace(/^\d+\.\s+/, ''); // ordered list markers

  return withoutPrefix
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links & images → their text
    .replace(/`[^`]*`/g, '') // inline code
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1') // bold / italic
    .replace(/<[^>]*>/g, '') // html tags
    .trim();
}
