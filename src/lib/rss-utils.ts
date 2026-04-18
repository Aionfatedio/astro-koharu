/**
 * Shared RSS feed utilities.
 *
 * Extracted from rss.xml.ts to avoid logic duplication.
 * Handles encrypted posts by replacing content with a notice.
 */
import { getSanitizeHtml, stripHtmlToText } from '@lib/sanitize';
import type { BlogPost } from '@/types/blog';

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
    description: post.data?.description ?? stripHtmlToText(post.rendered?.html ?? ''),
    content: getSanitizeHtml(post.rendered?.html ?? ''),
  };
}
