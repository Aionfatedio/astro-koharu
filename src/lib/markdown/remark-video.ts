/**
 * Remark plugin for video embedding
 * Transforms ::video{} directives into video elements with proper structure
 *
 * Usage in Markdown:
 * ::video{src="/media/video.webm"}
 * ::video{src="/media/video.mp4" poster="/img/poster.jpg"}
 * ::video{src="/media/video.webm" autoplay loop muted}
 *
 * Attributes:
 * - src: Video source URL (required)
 * - poster: Poster image URL (optional)
 * - autoplay: Auto-play video (optional, boolean)
 * - loop: Loop video (optional, boolean)
 * - muted: Mute video (optional, boolean)
 * - controls: Show controls (optional, defaults to true)
 * - playsinline: Play inline on mobile (optional, defaults to true)
 */

import type { Root } from 'mdast';
import type { LeafDirective } from 'mdast-util-directive';
import { visit } from 'unist-util-visit';

/**
 * Validate URL to ensure it's safe (relative path or http/https)
 */
function isValidUrl(url: string | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  // Allow relative paths starting with /
  if (trimmed.startsWith('/')) return true;
  // Allow http/https URLs
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Parse boolean attribute (presence means true)
 */
function parseBooleanAttr(value: string | null | undefined): boolean {
  // In directive syntax, boolean attrs are present with empty string or 'true'
  return value !== undefined && value !== 'false';
}

/**
 * Remark plugin to transform ::video directives into video elements
 */
export function remarkVideo() {
  return (tree: Root) => {
    visit(tree, (node) => {
      // Check for leaf directive with name 'video'
      if (node.type === 'leafDirective' && (node as LeafDirective).name === 'video') {
        const directive = node as LeafDirective;
        const attributes = directive.attributes || {};

        // Extract attributes
        const src = attributes.src?.trim() || '';
        const poster = attributes.poster?.trim() || '';
        const autoplay = parseBooleanAttr(attributes.autoplay);
        const loop = parseBooleanAttr(attributes.loop);
        const muted = parseBooleanAttr(attributes.muted);
        // Controls defaults to true unless explicitly set to false
        const controls = attributes.controls !== 'false';
        // Playsinline defaults to true for better mobile experience
        const playsinline = attributes.playsinline !== 'false';

        // Validate required fields
        if (!src) {
          console.warn('[remark-video] Missing required attribute (src) for ::video directive');
          return;
        }

        // Validate URLs
        if (!isValidUrl(src)) {
          console.warn(`[remark-video] Invalid src URL: ${src}`);
          return;
        }

        if (poster && !isValidUrl(poster)) {
          console.warn(`[remark-video] Invalid poster URL: ${poster}`);
          return;
        }

        // Build video properties
        const videoProperties: Record<string, string | boolean> = {
          src,
          class: 'markdown-video',
        };

        if (poster) videoProperties.poster = poster;
        if (controls) videoProperties.controls = true;
        if (playsinline) videoProperties.playsinline = true;
        if (autoplay) videoProperties.autoplay = true;
        if (loop) videoProperties.loop = true;
        if (muted) videoProperties.muted = true;

        // Transform to HTML
        if (!directive.data) {
          directive.data = {};
        }
        const data = directive.data;

        // Set hName to figure for the container (consistent with image handling)
        data.hName = 'figure';
        data.hProperties = {
          class: 'markdown-video-wrapper',
        };

        data.hChildren = [
          {
            type: 'element',
            tagName: 'video',
            properties: videoProperties,
            children: [],
          },
        ];
      }
    });
  };
}
