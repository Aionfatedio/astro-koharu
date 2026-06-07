import sanitizeHtml from 'sanitize-html';

export const getSanitizeHtml = (html: string) => {
  return sanitizeHtml(html, {
    // https://stackoverflow.com/questions/12229572/php-generated-xml-shows-invalid-char-value-27-message
    textFilter: (text) =>
      text.replace(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentional - filtering invalid XML characters
        /[^\x09\x0A\x0D\x20-\xFF\x85\xA0-\uD7FF\uE000-\uFDCF\uFDE0-\uFFFD]/gm,
        '',
      ),
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
  });
};

/**
 * Strip all HTML tags and return plain text, truncated to maxLength.
 * Used by RSS feeds to generate <description> from rendered HTML.
 */
export function stripHtmlToText(html: string, maxLength: number = 150): string {
  const text = sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
    textFilter: (text) =>
      text.replace(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentional - filtering invalid XML characters
        /[^\x09\x0A\x0D\x20-\xFF\x85\xA0-\uD7FF\uE000-\uFDCF\uFDE0-\uFFFD]/gm,
        '',
      ),
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
