/**
 * Shared RSS feed utilities.
 *
 * Extracted from rss.xml.ts to avoid logic duplication.
 * Handles encrypted posts by replacing content with a notice.
 */
import { getSanitizeHtml } from '@lib/sanitize';
import sanitizeHtml from 'sanitize-html';
import type { BlogPost } from '@/types/blog';

/** Generate a plain-text summary from rendered HTML */
function generateTextSummary(html?: string, length: number = 150): string {
  const text = sanitizeHtml(html ?? '', {
    allowedTags: [],
    allowedAttributes: {},
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentional - filtering invalid XML characters
    textFilter: (text) => text.replace(/[^\x09\x0A\x0D\x20-\xFF\x85\xA0-\uD7FF\uE000-\uFDCF\uFDE0-\uFFFD]/gm, ''),
  });
  if (text.length <= length) return text;
  return text.substring(0, length).replace(/\s+\S*$/, '');
}

/** Build RSS item fields, handling encrypted posts */
export function buildRssItemFields(post: BlogPost): { title: string; description: string; content: string } {
  if (post.data.password) {
    const rssNotice = '此文章已加密，请在网页中查看';
    return {
      title: `🔒 ${post.data.title}`,
      description: rssNotice,
      content: `<p>${rssNotice}</p>`,
    };
  }

  return {
    title: post.data.title,
    description: post.data?.description ?? generateTextSummary(post.rendered?.html),
    content: getSanitizeHtml(post.rendered?.html ?? ''),
  };
}
