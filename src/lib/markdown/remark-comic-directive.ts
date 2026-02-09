/**
 * Remark plugin for comic reader integration.
 * Transforms ::comic{} leaf directives into interactive comic card HTML.
 *
 * Usage in Markdown:
 *   ::comic{id="manga-1" name="漫画名称" src="/img/comic/manga-1/manifest.json" author="作者名" cover="/img/comic/manga-1/cover.jpg"}
 *
 * Attributes:
 *   id   — Unique identifier (required)
 *   name — Display name (required)
 *   src  — Path to manifest.json (required)
 *   author — Author name (optional)
 *   cover  — Cover image path (optional, auto-read from manifest if omitted)
 *
 * Cover priority: explicit cover attr > manifest.json cover field > none
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ElementContent, Element as HastElement } from 'hast';
import type { Root } from 'mdast';
import type { LeafDirective } from 'mdast-util-directive';
import { visit } from 'unist-util-visit';
import { escapeHtml } from './shoka-renderers';

// Icon SVG for comic card (always visible)
const COMIC_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="comic-card-icon-svg"><path d="M5 21q-.825 0-1.412-.587T3 19V5q0-.825.588-1.412T5 3h14q.825 0 1.413.588T21 5v14q0 .825-.587 1.413T19 21zm0-2h14V5H5zm1-2h12l-3.75-5l-3 4L9 13zm-1 2V5zm3.5-9q.625 0 1.063-.437T10 8.5t-.437-1.062T8.5 7t-1.062.438T7 8.5t.438 1.063T8.5 10"/></svg>';

// Arrow SVG for read button
const ARROW_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="comic-card-arrow"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>';

interface ComicManifest {
  id: string;
  name: string;
  author?: string;
  cover?: string;
  images: string[];
}

/** Validate URL: allow relative paths starting with / and http(s) URLs */
function isValidUrl(url: string | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (trimmed.startsWith('/')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Read manifest.json at build time and extract cover path */
function readManifestCover(srcPath: string): string | null {
  try {
    const relativePath = srcPath.startsWith('/') ? srcPath.slice(1) : srcPath;
    const filePath = path.join(process.cwd(), 'public', relativePath);
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    const manifest: ComicManifest = JSON.parse(content);
    return manifest.cover || null;
  } catch (error) {
    console.warn(`[remark-comic] Failed to read manifest: ${srcPath}`, error);
    return null;
  }
}

/** Remark plugin: transform ::comic directives into comic card HTML */
export function remarkComicDirective() {
  return (tree: Root) => {
    visit(tree, (node) => {
      if (node.type !== 'leafDirective') return;
      const directive = node as LeafDirective;
      if (directive.name !== 'comic') return;

      const attrs = directive.attributes || {};
      const id = escapeHtml((attrs.id || '').trim());
      const name = escapeHtml((attrs.name || '').trim());
      const src = (attrs.src || '').trim();
      const author = escapeHtml((attrs.author || '').trim());
      const explicitCover = (attrs.cover || '').trim();

      if (!id || !name || !src) {
        console.warn('[remark-comic] Missing required attributes (id, name, src) for ::comic directive');
        return;
      }
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

      // Transform directive node into HTML
      directive.data ??= {};
      const data = directive.data;

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
      const iconChildren: ElementContent[] = [{ type: 'raw', value: COMIC_ICON_SVG } as unknown as ElementContent];
      if (cover) {
        iconChildren.push({
          type: 'element',
          tagName: 'img',
          properties: { class: 'comic-card-cover-preview', src: cover, alt: `${name} 封面`, loading: 'lazy' },
          children: [],
        } as HastElement);
      }

      data.hChildren = [
        {
          type: 'element',
          tagName: 'div',
          properties: { class: 'comic-card' },
          children: [
            // Icon
            {
              type: 'element',
              tagName: 'div',
              properties: { class: 'comic-card-icon' },
              children: iconChildren,
            },
            // Info
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
                        type: 'element' as const,
                        tagName: 'div',
                        properties: { class: 'comic-card-author' },
                        children: [{ type: 'text' as const, value: author }],
                      },
                    ]
                  : []),
              ],
            },
            // Read button
            {
              type: 'element',
              tagName: 'button',
              properties: { class: 'comic-card-read-btn', type: 'button', 'aria-label': `阅读漫画: ${name}` },
              children: [
                {
                  type: 'element',
                  tagName: 'span',
                  properties: {},
                  children: [{ type: 'text', value: '开始阅读' }],
                },
                { type: 'raw', value: ARROW_SVG } as unknown as ElementContent,
              ],
            },
          ],
        },
      ];
    });
  };
}
