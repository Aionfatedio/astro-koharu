import assert from 'node:assert/strict';
import test from 'node:test';
import type { Root } from 'mdast';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { remarkImageGrid } from './remark-image-grid';

interface HastLikeNode {
  type: string;
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
    hChildren?: unknown[];
  };
  children?: HastLikeNode[];
  alt?: string | null;
  url?: string;
}

function transform(markdown: string): Root {
  const processor = unified().use(remarkParse).use(remarkImageGrid);
  const tree = processor.parse(markdown);
  return processor.runSync(tree) as Root;
}

const CAROUSEL_BLOCK = `[grid mode=carousel]

![image|366x500](https://example.com/a.jpeg)

![image|324x500](https://example.com/b.jpeg)

![no-size](https://example.com/c.jpeg)

[/grid]`;

test('transforms [grid mode=carousel] block into a carousel structure', () => {
  const tree = transform(CAROUSEL_BLOCK) as unknown as HastLikeNode;

  assert.equal(tree.children?.length, 1);
  const carousel = tree.children?.[0] as HastLikeNode;
  assert.equal(carousel.data?.hName, 'div');
  assert.equal(carousel.data?.hProperties?.class, 'image-carousel');
  assert.equal(carousel.data?.hProperties?.['data-mode'], 'carousel');

  const [track, controls] = carousel.children ?? [];
  assert.equal(track.data?.hProperties?.class, 'image-carousel__track');
  assert.equal(track.children?.length, 3);

  const [first, , third] = track.children ?? [];
  assert.equal(first.data?.hProperties?.class, 'image-carousel__slide is-active');
  assert.equal(first.data?.hProperties?.style, 'aspect-ratio: 366 / 500');
  // Slide without |WxH hint gets no inline aspect-ratio (runtime derives it)
  assert.equal(third.data?.hProperties?.style, undefined);

  // Original image nodes survive (Astro image optimization still sees them)
  const firstImage = first.children?.[0] as HastLikeNode;
  assert.equal(firstImage.type, 'image');
  assert.equal(firstImage.url, 'https://example.com/a.jpeg');
  // |WxH size hint stripped from alt, moved to width/height attributes
  assert.equal(firstImage.alt, 'image');
  assert.equal(firstImage.data?.hProperties?.width, 366);
  assert.equal(firstImage.data?.hProperties?.height, 500);

  // Controls: prev button + dots + next button
  assert.equal(controls.data?.hProperties?.class, 'image-carousel__controls');
  const hChildren = controls.data?.hChildren as HastLikeNode[];
  assert.equal(hChildren.length, 3);
  const dots = hChildren[1];
  assert.equal(dots.children?.length, 3);
});

test('transforms inline form without blank lines between images', () => {
  const tree = transform(
    '[grid mode=carousel]\n![a|100x200](https://example.com/a.png)\n![b|100x200](https://example.com/b.png)\n[/grid]',
  ) as unknown as HastLikeNode;

  assert.equal(tree.children?.length, 1);
  const carousel = tree.children?.[0] as HastLikeNode;
  assert.equal(carousel.data?.hProperties?.class, 'image-carousel');
  assert.equal(carousel.children?.[0]?.children?.length, 2);
});

test('[grid] without carousel mode strips markers and keeps images', () => {
  const tree = transform(`[grid]

![a](https://example.com/a.png)

![b](https://example.com/b.png)

[/grid]`);

  assert.equal(tree.children.length, 2);
  for (const child of tree.children) {
    assert.equal(child.type, 'paragraph');
  }
});

test('carousel with a single image degrades to a plain image', () => {
  const tree = transform(`[grid mode=carousel]

![only|100x100](https://example.com/only.png)

[/grid]`);

  assert.equal(tree.children.length, 1);
  assert.equal(tree.children[0].type, 'paragraph');
});

test('unclosed [grid] marker is left untouched', () => {
  const tree = transform(`[grid mode=carousel]

![a](https://example.com/a.png)`);

  assert.equal(tree.children.length, 2);
  assert.equal(tree.children[0].type, 'paragraph');
});
