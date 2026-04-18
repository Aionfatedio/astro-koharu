/**
 * Iframe-embed enhancer
 *
 * Injects an "open in new tab" button into the top-right corner of every
 * `.iframe-embed` container on the page. The button reads the `src` attribute
 * from the inner `<iframe>` and opens it as a new browser tab.
 *
 * Uses `<a target="_blank">` rather than a button + JS click handler so:
 * - Right-click "open in new tab" works natively
 * - Middle-click and keyboard navigation work
 * - No JS required for the actual navigation
 *
 * Idempotent: re-running over the same container will not inject duplicates.
 */

const OPEN_BUTTON_CLASS = 'iframe-embed-open';

/**
 * SVG icon (Lucide square-arrow-out-up-right, 24x24 viewBox).
 * Rendered at 16x16 to match markdown-image-fullscreen's icon weight
 * (same viewBox/stroke-width as the fullscreen icon, so line thickness aligns).
 */
const EXTERNAL_LINK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-arrow-out-up-right-icon lucide-square-arrow-out-up-right" aria-hidden="true"><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/><path d="m21 3-9 9"/><path d="M15 3h6v6"/></svg>`;

function createOpenButton(href: string): HTMLAnchorElement {
  const anchor = document.createElement('a');
  anchor.className = OPEN_BUTTON_CLASS;
  anchor.href = href;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.setAttribute('aria-label', '在新窗口打开');
  anchor.title = '在新窗口打开';
  anchor.innerHTML = EXTERNAL_LINK_SVG;
  return anchor;
}

/**
 * Scan the given container for `.iframe-embed` wrappers and inject the
 * open-in-new-tab button into each one that doesn't already have it.
 */
export function enhanceIframes(container: Element): void {
  const wrappers = container.querySelectorAll<HTMLElement>('.iframe-embed');

  for (const wrapper of wrappers) {
    if (wrapper.querySelector(`.${OPEN_BUTTON_CLASS}`)) continue;

    const iframe = wrapper.querySelector<HTMLIFrameElement>('iframe[src]');
    const src = iframe?.getAttribute('src')?.trim();
    if (!src) continue;

    wrapper.appendChild(createOpenButton(src));
  }
}
