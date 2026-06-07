import path from 'node:path';
import { remark } from 'remark';
import strip from 'strip-markdown';
import { transliterateSlugValue } from '../../lib/slug-core';

/** Blog content root and glob, shared by the build-time generators. */
export const CONTENT_ROOT = path.join('src', 'content', 'blog');
export const CONTENT_GLOB = 'src/content/blog/**/*.md';

/**
 * Extract plain text from markdown using remark + strip-markdown, then strip
 * MDX import/export lines, low-value section headings, all-caps headings, and
 * table / container (:::) remnants.
 *
 * @param collapseNewlines convert newlines to spaces — similarity embeddings need
 *   a single line; summaries keep paragraph breaks.
 */
export async function getPlainText(markdown: string, collapseNewlines = false): Promise<string> {
  const result = await remark().use(strip).process(markdown);
  let text = String(result)
    // Remove import/export statements (MDX)
    .replace(/^import\s+.*$/gm, '')
    .replace(/^export\s+.*$/gm, '')
    // Remove common section headings that don't add semantic value
    .replace(/^\s*(TLDR|Introduction|Conclusion|Summary|References?|Footnotes?)\s*$/gim, '')
    // Remove all-caps headings
    .replace(/^[A-Z\s]{4,}$/gm, '')
    // Remove table remnants
    .replace(/^\|.*\|$/gm, '')
    // Remove container directives (:::)
    .replace(/^:::.*/gm, '')
    // Normalize multiple newlines
    .replace(/\n{3,}/g, '\n\n');
  if (collapseNewlines) text = text.replace(/\n/g, ' ');
  return text.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Derive a post slug from its file path, honoring an explicit `link` field and
 * optional CJK→pinyin transliteration. Mirrors the runtime route slug logic.
 */
export function extractSlug(filePath: string, link: string | undefined, slugTransliterationEnabled: boolean): string {
  if (link) return link;

  const relativePath = path.relative(CONTENT_ROOT, filePath);
  const extension = path.extname(relativePath);
  const slug = extension ? relativePath.slice(0, -extension.length) : relativePath;
  return transliterateSlugValue(slug.split(path.sep).join('/'), slugTransliterationEnabled);
}
