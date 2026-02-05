/**
 * Rehype plugin to enhance images with lazy loading and placeholder containers
 * Wraps images in figure elements with placeholder styling for CLS prevention
 */
import type { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';

export function rehypeImagePlaceholder() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'img') return;
      if (index === undefined || !parent) return;

      // Skip if already wrapped (e.g., in a figure or custom component)
      if (parent.type === 'element' && parent.tagName === 'figure') return;

      // Skip comic card cover preview images (handled by remark-comic)
      const classValue = node.properties?.class;
      const existingClass = Array.isArray(classValue) ? classValue.join(' ') : typeof classValue === 'string' ? classValue : '';
      if (existingClass.includes('comic-card-cover-preview')) return;

      // Skip wrapping if image is inside a link (e.g., [![alt](img)](url))
      // Only add lazy loading attributes, don't wrap with figure
      if (parent.type === 'element' && parent.tagName === 'a') {
        node.properties = {
          ...node.properties,
          loading: 'lazy',
          decoding: 'async',
        };
        return;
      } 

      // Parse URL hash modifiers (e.g., #center)
      const src = node.properties?.src as string | undefined;
      let wrapperClass = 'markdown-image-wrapper';
      if (src?.includes('#')) {
        const hashIndex = src.lastIndexOf('#');
        const hash = src.slice(hashIndex + 1);
        node.properties.src = src.slice(0, hashIndex);
        if (hash === 'center') wrapperClass += ' centered';
      }

      // Add lazy loading attributes and class
      node.properties = {
        ...node.properties,
        loading: 'lazy',
        decoding: 'async',
        class: `${existingClass} markdown-image`.trim(),
      };

      // Wrap in figure container
      const wrapper: Element = {
        type: 'element',
        tagName: 'figure',
        properties: { class: wrapperClass },
        children: [node],
      };

      // Replace img with wrapper
      parent.children[index] = wrapper;
    });
  };
}
