/**
 * Remark plugin for comic reader integration
 * Transforms ::comic{} directives into interactive comic cards
 *
 * Usage in Markdown:
 * ::comic{id="manga-1" name="漫画名称" src="/img/comic/manga-1/manifest.json" author="作者名" cover="/img/comic/manga-1/cover.jpg"}
 *
 * Attributes:
 * - id: Unique identifier for the comic (required)
 * - name: Display name of the comic (required)
 * - src: Path to manifest.json file containing image list (required)
 * - author: Author name (optional)
 * - cover: Cover image path (optional, auto-loaded from manifest if not specified)
 *
 * Cover priority:
 * 1. cover attribute in ::comic{} (highest)
 * 2. cover field in manifest.json
 * 3. No cover (hover preview disabled)
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Root } from 'mdast';
import type { LeafDirective } from 'mdast-util-directive';
import sanitizeHtml from 'sanitize-html';
import { visit } from 'unist-util-visit';

// Icon SVG for comic card (always visible)
const COMIC_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="comic-card-icon-svg"><path d="M5 21q-.825 0-1.412-.587T3 19V5q0-.825.588-1.412T5 3h14q.825 0 1.413.588T21 5v14q0 .825-.587 1.413T19 21zm0-2h14V5H5zm1-2h12l-3.75-5l-3 4L9 13zm-1 2V5zm3.5-9q.625 0 1.063-.437T10 8.5t-.437-1.062T8.5 7t-1.062.438T7 8.5t.438 1.063T8.5 10"/></svg>`;
interface ComicManifest {
  id: string;
  name: string;
  author?: string;
  cover?: string;
  images: string[];
}

/**
 * Sanitize user input to prevent XSS attacks
 */
function sanitizeText(text: string | undefined): string {
  if (!text) return '';
  return sanitizeHtml(text, {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();
}

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
 * Read manifest file and extract cover path
 * This runs at build time, so we can use sync file operations
 */
function readManifestCover(srcPath: string): string | null {
  try {
    // Convert URL path to file system path
    // /img/comic/xxx/manifest.json -> public/img/comic/xxx/manifest.json
    const relativePath = srcPath.startsWith('/') ? srcPath.slice(1) : srcPath;
    const filePath = path.join(process.cwd(), 'public', relativePath);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const manifest: ComicManifest = JSON.parse(content);
    return manifest.cover || null;
  } catch (error) {
    console.warn(`[remark-comic] Failed to read manifest: ${srcPath}`, error);
    return null;
  }
}

/**
 * Remark plugin to transform ::comic directives into comic cards
 */
export function remarkComic() {
  return (tree: Root) => {
    visit(tree, (node) => {
      // Check for leaf directive with name 'comic'
      if (node.type === 'leafDirective' && (node as LeafDirective).name === 'comic') {
        const directive = node as LeafDirective;
        const attributes = directive.attributes || {};

        // Extract and sanitize attributes
        const id = sanitizeText(attributes.id);
        const name = sanitizeText(attributes.name);
        const src = attributes.src?.trim() || '';
        const author = sanitizeText(attributes.author);
        const explicitCover = attributes.cover?.trim() || '';

        // Validate required fields
        if (!id || !name || !src) {
          console.warn('[remark-comic] Missing required attributes (id, name, src) for ::comic directive');
          return;
        }

        // Validate URLs
        if (!isValidUrl(src)) {
          console.warn(`[remark-comic] Invalid src URL: ${src}`);
          return;
        }

        if (explicitCover && !isValidUrl(explicitCover)) {
          console.warn(`[remark-comic] Invalid cover URL: ${explicitCover}`);
          return;
        }

        // Determine cover: explicit > manifest > none
        let cover = explicitCover;
        if (!cover) {
          const manifestCover = readManifestCover(src);
          if (manifestCover && isValidUrl(manifestCover)) {
            cover = manifestCover;
          }
        }

        // Transform to HTML
        if (!directive.data) {
          directive.data = {};
        }
        const data = directive.data;

        // Set hName to div for the container
        data.hName = 'div';
        data.hProperties = {
          class: 'comic-card-container',
          'data-comic-id': id,
          'data-comic-name': name,
          'data-comic-src': src,
          ...(author && { 'data-comic-author': author }),
          ...(cover && { 'data-comic-cover': cover }),
        };

        // Build icon children: SVG + optional cover preview image
        const iconChildren: any[] = [
          {
            type: 'raw',
            value: COMIC_ICON_SVG,
          },
        ];

        // Add cover preview image if available (shown on hover)
        if (cover) {
          iconChildren.push({
            type: 'element',
            tagName: 'img',
            properties: {
              class: 'comic-card-cover-preview',
              src: cover,
              alt: `${name} 封面`,
              loading: 'lazy',
            },
            children: [],
          });
        }

        data.hChildren = [
          {
            type: 'element',
            tagName: 'div',
            properties: { class: 'comic-card' },
            children: [
              // Icon container with SVG and optional cover preview
              {
                type: 'element',
                tagName: 'div',
                properties: {
                  class: 'comic-card-icon',
                },
                children: iconChildren,
              },
              // Info section
              {
                type: 'element',
                tagName: 'div',
                properties: { class: 'comic-card-info' },
                children: [
                  {
                    type: 'element',
                    tagName: 'div',
                    properties: { class: 'comic-card-name' },
                    children: [{ type: 'text', value: name }],
                  },
                  ...(author
                    ? [
                        {
                          type: 'element',
                          tagName: 'div',
                          properties: { class: 'comic-card-author' },
                          children: [{ type: 'text', value: author }],
                        },
                      ]
                    : []),
                ],
              },
              // Read button
              {
                type: 'element',
                tagName: 'button',
                properties: {
                  class: 'comic-card-read-btn',
                  type: 'button',
                  'aria-label': `阅读漫画: ${name}`,
                },
                children: [
                  {
                    type: 'element',
                    tagName: 'span',
                    properties: {},
                    children: [{ type: 'text', value: '开始阅读' }],
                  },
                  {
                    type: 'raw',
                    value: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="comic-card-arrow"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>`,
                  },
                ],
              },
            ],
          },
        ];
      }
    });
  };
}
