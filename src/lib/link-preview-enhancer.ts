/**
 * Link preview image and favicon error handling
 * Handles image/favicon load failures by showing graceful fallback UI
 */

const enhancedImages = new WeakSet<HTMLImageElement>();
const enhancedFavicons = new WeakSet<HTMLImageElement>();

// Default globe SVG for unknown domains
const DEFAULT_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0" viewBox="0 0 24 24"><path fill="#c8ccd3" d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10s-4.477 10-10 10m-2.29-2.333A17.9 17.9 0 0 1 8.027 13H4.062a8.01 8.01 0 0 0 5.648 6.667M10.03 13c.151 2.439.848 4.73 1.97 6.752A15.9 15.9 0 0 0 13.97 13zm9.908 0h-3.965a17.9 17.9 0 0 1-1.683 6.667A8.01 8.01 0 0 0 19.938 13M4.062 11h3.965A17.9 17.9 0 0 1 9.71 4.333A8.01 8.01 0 0 0 4.062 11m5.969 0h3.938A15.9 15.9 0 0 0 12 4.248A15.9 15.9 0 0 0 10.03 11m4.259-6.667A17.9 17.9 0 0 1 15.973 11h3.965a8.01 8.01 0 0 0-5.648-6.667"/></svg>`;

// Static mapping of known domains to their SVG icons
const DOMAIN_FAVICON_MAP: Record<string, string> = {
  'bilibili.com': `<img src="https://icon.bqb.cool/?url=https://www.bilibili.com/" alt="" class="link-preview-favicon h-4 w-4 shrink-0" data-domain="bilibili.com" aria-hidden="true">`
};

/**
 * Create error placeholder for failed link preview images
 */
function createErrorPlaceholder(title: string): HTMLElement {
  const placeholder = document.createElement('div');
  placeholder.className = 'link-preview-image-error';
  placeholder.setAttribute('role', 'img');
  placeholder.setAttribute('aria-label', `预览图片加载失败: ${title}`);

  // Icon
  const icon = document.createElement('span');
  icon.className = 'link-preview-image-error-icon';
  icon.setAttribute('aria-hidden', 'true');

  // Text
  const text = document.createElement('span');
  text.className = 'link-preview-image-error-text';
  text.textContent = '预览加载失败';

  placeholder.appendChild(icon);
  placeholder.appendChild(text);

  return placeholder;
}

/**
 * Handle image load error
 */
function handleImageError(img: HTMLImageElement): void {
  img.classList.add('error');

  // Get fallback title from data attribute
  const title = img.getAttribute('data-fallback-title') || '预览';

  // Add error placeholder
  const imageContainer = img.parentElement;

  if (imageContainer && !imageContainer.querySelector('.link-preview-image-error')) {
    const placeholder = createErrorPlaceholder(title);
    imageContainer.appendChild(placeholder);
  }
}

/**
 * Get fallback SVG for a domain
 * Returns domain-specific SVG if available, otherwise default globe icon
 */
function getFaviconFallback(domain: string): string {
  // Check for exact match first
  if (DOMAIN_FAVICON_MAP[domain]) {
    return DOMAIN_FAVICON_MAP[domain];
  }

  // Check if domain ends with any known domain (handles subdomains like www.bilibili.com)
  for (const [knownDomain, svg] of Object.entries(DOMAIN_FAVICON_MAP)) {
    if (domain.endsWith(knownDomain) || domain.endsWith(`.${knownDomain}`)) {
      return svg;
    }
  }

  return DEFAULT_FAVICON_SVG;
}

/**
 * Handle favicon load error
 */
function handleFaviconError(img: HTMLImageElement): void {
  const domain = img.getAttribute('data-domain') || '';
  const fallbackSvg = getFaviconFallback(domain);

  // Create a wrapper span and replace the img with SVG
  const wrapper = document.createElement('span');
  wrapper.className = 'link-preview-favicon-fallback';
  wrapper.innerHTML = fallbackSvg;

  img.replaceWith(wrapper);
}

/**
 * Enhance all link preview images in container
 */
export function enhanceLinkPreviews(container: Element): void {
  // Enhance preview images
  const images = container.querySelectorAll<HTMLImageElement>('.link-preview-image');

  images.forEach((img) => {
    // Skip if already enhanced
    if (enhancedImages.has(img)) return;
    enhancedImages.add(img);

    // Check if already errored (cached broken image)
    if (img.complete && img.naturalWidth === 0) {
      handleImageError(img);
      return;
    }

    // Handle future errors
    img.addEventListener('error', () => handleImageError(img), { once: true });
  });

  // Enhance favicons
  const favicons = container.querySelectorAll<HTMLImageElement>('.link-preview-favicon');

  favicons.forEach((img) => {
    // Skip if already enhanced
    if (enhancedFavicons.has(img)) return;
    enhancedFavicons.add(img);

    // Check if already errored (cached broken image)
    if (img.complete && img.naturalWidth === 0) {
      handleFaviconError(img);
      return;
    }

    // Handle future errors
    img.addEventListener('error', () => handleFaviconError(img), { once: true });
  });
}
