/**
 * Content Enhancer Module
 *
 * Provides content enhancement functionality for markdown content.
 * Used by both CustomContent and CustomContentWrapper components.
 */

import type { ContentConfig } from '@constants/content-config';
import { enhanceAllCodeBlocks } from '@lib/code-block-enhancer';
import { enhanceImages } from '@lib/image-enhancer';
import { initInfographicEnhancer } from '@lib/infographic-enhancer';
import { enhanceLinkPreviews } from '@lib/link-preview-enhancer';
import { initMermaidEnhancer } from '@lib/mermaid-enhancer';
import { cleanupVideos, enhanceVideos } from '@lib/video-enhancer';

const DEFAULT_CONFIG: ContentConfig = {
  addBlankTarget: true,
  smoothScroll: true,
  addHeadingLevel: true,
  enhanceCodeBlock: true,
  enableCodeCopy: true,
  enableCodeFullscreen: true,
  enableLinkEmbed: true,
  enableTweetEmbed: true,
  enableOGPreview: true,
  previewCacheTime: 3600,
  lazyLoadEmbeds: true,
};

/**
 * Enhance content within a container element
 */
export function enhanceContent(contentContainer: Element | null): void {
  if (!contentContainer) return;

  // Avoid re-enhancing
  if (contentContainer.getAttribute('data-enhanced') === 'true') return;

  // Get configuration from data attribute
  const configData = contentContainer.getAttribute('data-config');
  const config: ContentConfig = configData ? JSON.parse(configData) : DEFAULT_CONFIG;

  // Add target="_blank" to external links
  if (config.addBlankTarget) {
    const links = contentContainer.querySelectorAll('a[href]');
    links.forEach((link: Element) => {
      const anchor = link as HTMLAnchorElement;
      const href = anchor.getAttribute('href') || '';

      // Check if it's an external link (starts with http/https or is absolute)
      if (href.startsWith('http') || href.startsWith('//')) {
        anchor.setAttribute('target', '_blank');
      }
    });
  }

  // Add smooth scroll to anchor links
  if (config.smoothScroll) {
    const anchorLinks = contentContainer.querySelectorAll('a.anchor-link[href^="#"]');
    anchorLinks.forEach((link: Element) => {
      const anchor = link as HTMLAnchorElement;

      anchor.addEventListener('click', (e) => {
        e.preventDefault();

        const targetId = anchor.getAttribute('href')?.substring(1);
        if (!targetId) return;

        const targetElement = document.getElementById(targetId);
        if (targetElement) {
          targetElement.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });

          // Update URL hash without jumping
          history.pushState(null, '', `#${targetId}`);
        }
      });
    });
  }

  // Add heading level labels (H1, H2, etc.)
  if (config.addHeadingLevel) {
    const headings = contentContainer.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach((heading: Element) => {
      const level = heading.tagName[1]; // Extract number from H1, H2, etc.
      heading.setAttribute('data-level', `H${level}`);
    });
  }

  // Enhance code blocks with Mac window style
  if (config.enhanceCodeBlock) {
    enhanceAllCodeBlocks(contentContainer, {
      enableCopy: config.enableCodeCopy,
      enableFullscreen: config.enableCodeFullscreen,
      onFullscreen: (info) => {
        // Dispatch custom event for React component to handle
        window.dispatchEvent(
          new CustomEvent('open-code-fullscreen', {
            detail: {
              code: info.code,
              codeHTML: info.codeHTML,
              language: info.language,
              preClassName: info.preClassName,
              preStyle: info.preStyle,
              codeClassName: info.codeClassName,
            },
          }),
        );
      },
    });

    // Enhance mermaid diagrams with toolbar (runs after astro-mermaid renders)
    initMermaidEnhancer();

    // Enhance infographic diagrams (renders and adds toolbar)
    initInfographicEnhancer();
  }

  // Enhance images with loading states
  enhanceImages(contentContainer);

  // Enhance link preview images with error handling
  enhanceLinkPreviews(contentContainer);

  // Enhance videos with Artplayer
  enhanceVideos(contentContainer);

  // Mark as enhanced
  contentContainer.setAttribute('data-enhanced', 'true');
}

/**
 * Initialize content enhancement with page lifecycle handlers
 * @param selector - CSS selector for content container (default: '.custom-content')
 */
export function initContentEnhancer(selector = '.custom-content'): void {
  const enhance = () => {
    // Reset enhanced state on page change
    const contentContainer = document.querySelector(selector);
    if (contentContainer) {
      contentContainer.removeAttribute('data-enhanced');
    }
    enhanceContent(contentContainer);
  };

  // Run on Astro page load (View Transitions)
  document.addEventListener('astro:page-load', enhance);

  // Cleanup videos before page swap (Astro View Transitions)
  document.addEventListener('astro:before-swap', () => {
    const contentContainer = document.querySelector(selector);
    if (contentContainer) {
      cleanupVideos(contentContainer);
    }
  });

  // Run immediately if already loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhance);
  } else {
    enhance();
  }
}

// Re-export cleanup function for manual cleanup scenarios
export { cleanupVideos };
