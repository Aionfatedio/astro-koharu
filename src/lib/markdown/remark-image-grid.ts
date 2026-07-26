/**
 * Remark plugin for Discourse-style image grid carousel syntax.
 *
 * Usage in Markdown:
 *   [grid mode=carousel]
 *
 *   ![alt|366x500](https://example.com/a.jpeg)
 *
 *   ![alt|324x500](https://example.com/b.jpeg)
 *
 *   [/grid]
 *
 * Behavior:
 *   - mode=carousel with 2+ images → horizontal scroll-snap carousel.
 *     Runtime behavior lives in src/lib/carousel-enhancer.ts, styles in
 *     src/styles/theme/image-carousel.css. The lightbox reuses PhotoSwipe
 *     through the standard .markdown-image pipeline (rehype-image-placeholder
 *     still wraps every slide image, so image-enhancer picks them up).
 *   - Other modes / fewer than 2 images → markers are stripped and images
 *     render as regular markdown images (graceful fallback).
 *   - The Discourse `|WxH` alt suffix provides the slide aspect ratio and the
 *     img width/height attributes, and is stripped from the rendered alt text.
 *
 * Image nodes are kept as mdast children (not pre-rendered to hast) so
 * Astro's image collection still optimizes local images inside a grid.
 */
import type { ElementContent } from 'hast';
import type { Image, Paragraph, Parent, Root, RootContent } from 'mdast';
import { visit } from 'unist-util-visit';

const GRID_OPEN_RE = /^\[grid((?:[ \t][^\]]*)?)\]$/i;
const GRID_CLOSE_RE = /^\[\/grid\]$/i;
/** Inline form: markers share the paragraph with the images (no blank lines) */
const GRID_OPEN_INLINE_RE = /^\[grid((?:[ \t][^\]\n]*)?)\][ \t]*\n/i;
const GRID_CLOSE_INLINE_RE = /\n[ \t]*\[\/grid\][ \t]*$/i;

/** Discourse image size hint: `alt|WIDTHxHEIGHT` or `alt|WIDTHxHEIGHT,SCALE%` */
const ALT_SIZE_RE = /^(.*?)\s*\|\s*(\d{1,5})x(\d{1,5})(?:,\s*\d{1,3}%)?$/;

const CHEVRON_LEFT_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
const CHEVRON_RIGHT_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

interface SlideSize {
  width: number;
  height: number;
}

interface CarouselNodeData {
  hName?: string;
  hProperties?: Record<string, unknown>;
  hChildren?: ElementContent[];
}

/** Extract plain text if the paragraph contains only text children, else null */
function paragraphText(node: RootContent): string | null {
  if (node.type !== 'paragraph') return null;
  let text = '';
  for (const child of node.children) {
    if (child.type !== 'text') return null;
    text += child.value;
  }
  return text.trim();
}

/** Parse `key=value` pairs from the opening marker (values may be quoted) */
function parseGridAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let match = attrRe.exec(raw);
  while (match) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
    match = attrRe.exec(raw);
  }
  return attrs;
}

/** Collect image nodes (document order) from a range of sibling nodes */
function collectImages(nodes: RootContent[]): Image[] {
  const images: Image[] = [];
  for (const node of nodes) {
    visit(node, 'image', (image: Image) => {
      images.push(image);
    });
  }
  return images;
}

/**
 * Pull the `|WxH` size hint out of the image alt text.
 * Mutates the alt to its cleaned form; returns the parsed size or null.
 */
function extractSlideSize(image: Image): SlideSize | null {
  const match = (image.alt ?? '').match(ALT_SIZE_RE);
  if (!match) return null;
  image.alt = match[1].trim();
  const width = Number.parseInt(match[2], 10);
  const height = Number.parseInt(match[3], 10);
  if (!width || !height) return null;
  return { width, height };
}

function buildNavButton(direction: 'prev' | 'next', label: string): ElementContent {
  return {
    type: 'element',
    tagName: 'button',
    properties: {
      class: `image-carousel__nav image-carousel__nav--${direction}`,
      type: 'button',
      title: label,
      'aria-label': label,
    },
    children: [
      { type: 'raw', value: direction === 'prev' ? CHEVRON_LEFT_SVG : CHEVRON_RIGHT_SVG } as unknown as ElementContent,
    ],
  };
}

function buildDots(count: number): ElementContent {
  const dots: ElementContent[] = [];
  for (let i = 0; i < count; i++) {
    dots.push({
      type: 'element',
      tagName: 'button',
      properties: {
        class: i === 0 ? 'image-carousel__dot active' : 'image-carousel__dot',
        type: 'button',
        'aria-label': `转到第 ${i + 1} 张`,
        ...(i === 0 ? { 'aria-current': 'true' } : {}),
      },
      children: [],
    });
  }
  return {
    type: 'element',
    tagName: 'div',
    properties: { class: 'image-carousel__dots' },
    children: dots,
  };
}

/** Build the carousel container node; slides keep the original mdast image nodes */
function buildCarouselNode(images: Image[], sizes: (SlideSize | null)[]): RootContent {
  const slides = images.map((image, index) => {
    const size = sizes[index];
    if (size) {
      image.data ??= {};
      const imageData = image.data as CarouselNodeData;
      imageData.hProperties = { ...imageData.hProperties, width: size.width, height: size.height };
    }
    return {
      type: 'imageCarouselSlide',
      data: {
        hName: 'div',
        hProperties: {
          class: index === 0 ? 'image-carousel__slide is-active' : 'image-carousel__slide',
          'data-index': String(index),
          // Slide height derives from the image's real aspect ratio (Discourse-style)
          ...(size ? { style: `aspect-ratio: ${size.width} / ${size.height}` } : {}),
        },
      },
      children: [image],
    };
  });

  const track = {
    type: 'imageCarouselTrack',
    data: {
      hName: 'div',
      hProperties: {
        class: 'image-carousel__track',
        tabIndex: 0,
        role: 'region',
        'aria-label': '图片轮播，可使用左右方向键切换',
      },
    },
    children: slides,
  };

  const controls = {
    type: 'imageCarouselControls',
    data: {
      hName: 'div',
      hProperties: { class: 'image-carousel__controls' },
      hChildren: [buildNavButton('prev', '上一张'), buildDots(images.length), buildNavButton('next', '下一张')],
    },
    children: [],
  };

  return {
    type: 'imageCarousel',
    data: {
      hName: 'div',
      hProperties: { class: 'image-carousel', 'data-mode': 'carousel' },
    },
    children: [track, controls],
  } as unknown as RootContent;
}

/**
 * Inline form: `[grid ...]` and `[/grid]` inside a single paragraph
 * (images on adjacent lines without blank lines between them).
 */
function transformInlineGrid(paragraph: Paragraph): RootContent | null {
  const first = paragraph.children[0];
  const last = paragraph.children[paragraph.children.length - 1];
  if (first?.type !== 'text' || last?.type !== 'text') return null;

  const openMatch = first.value.match(GRID_OPEN_INLINE_RE);
  const closeMatch = last.value.match(GRID_CLOSE_INLINE_RE);
  if (!openMatch || !closeMatch) return null;

  const images = paragraph.children.filter((child): child is Image => child.type === 'image');
  const sizes = images.map(extractSlideSize);
  const mode = parseGridAttrs(openMatch[1] ?? '').mode?.toLowerCase();

  if (mode === 'carousel' && images.length >= 2) {
    return buildCarouselNode(images, sizes);
  }

  // Fallback: strip the markers, keep the paragraph content
  first.value = first.value.replace(GRID_OPEN_INLINE_RE, '');
  last.value = last.value.replace(GRID_CLOSE_INLINE_RE, '');
  return null;
}

/** Scan a parent's children for grid blocks and transform them in place */
function transformGridBlocks(parent: Parent): void {
  const children = parent.children as RootContent[];
  let i = 0;

  while (i < children.length) {
    const node = children[i];

    // Inline form: whole grid inside one paragraph
    if (node.type === 'paragraph') {
      const replacement = transformInlineGrid(node);
      if (replacement) {
        children.splice(i, 1, replacement);
        i += 1;
        continue;
      }
    }

    // Block form: `[grid ...]` and `[/grid]` as standalone paragraphs
    const openMatch = paragraphText(node)?.match(GRID_OPEN_RE);
    if (!openMatch) {
      i += 1;
      continue;
    }

    let closeIndex = -1;
    for (let j = i + 1; j < children.length; j++) {
      if (paragraphText(children[j])?.match(GRID_CLOSE_RE)) {
        closeIndex = j;
        break;
      }
    }
    if (closeIndex === -1) {
      // Unclosed marker: leave untouched
      i += 1;
      continue;
    }

    const images = collectImages(children.slice(i + 1, closeIndex));
    const sizes = images.map(extractSlideSize);
    const mode = parseGridAttrs(openMatch[1] ?? '').mode?.toLowerCase();

    if (mode === 'carousel' && images.length >= 2) {
      children.splice(i, closeIndex - i + 1, buildCarouselNode(images, sizes));
      i += 1;
    } else {
      // Unsupported mode or too few images: strip markers, keep content as-is
      children.splice(closeIndex, 1);
      children.splice(i, 1);
    }
  }
}

/** Remark plugin: transform [grid mode=carousel] blocks into image carousels */
export function remarkImageGrid() {
  return (tree: Root) => {
    // Handle top-level grids plus grids nested in containers (blockquote, list item, etc.)
    visit(tree, (node) => {
      if (
        node.type === 'root' ||
        node.type === 'blockquote' ||
        node.type === 'listItem' ||
        node.type === 'containerDirective'
      ) {
        transformGridBlocks(node as Parent);
      }
    });
  };
}
