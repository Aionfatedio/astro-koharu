/**
 * Image loading enhancement
 * Adds loaded/error states and portrait image grouping
 * Uses PhotoSwipe for lightbox functionality
 */

import type PhotoSwipe from 'photoswipe';
import type { SlideData } from 'photoswipe';

// Track enhanced images to avoid duplicate processing
const enhancedImages = new WeakSet<HTMLImageElement>();

// Track containers that have click listeners bound
const boundContainers = new WeakSet<Element>();

// PhotoSwipe instance management
let photoSwipeInstance: PhotoSwipe | null = null;
let isOpening = false; // Prevent double-click race condition

/**
 * Collect all markdown images in container as PhotoSwipe slide data
 */
function collectImageSlides(container: Element): SlideData[] {
  const images = container.querySelectorAll<HTMLImageElement>('.markdown-image.loaded');
  const slides: SlideData[] = [];

  images.forEach((img) => {
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      slides.push({
        src: img.src,
        width: img.naturalWidth,
        height: img.naturalHeight,
        alt: img.alt || '',
        // Use the same src as placeholder for smooth animation (image is already loaded)
        msrc: img.src,
        // Store reference to thumbnail element for zoom animation
        element: img,
      });
    }
  });

  return slides;
}

/**
 * Find index of clicked image in slides array
 */
function findImageIndex(slides: SlideData[], clickedImg: HTMLImageElement): number {
  return slides.findIndex((slide) => slide.src === clickedImg.src);
}

/**
 * Open PhotoSwipe lightbox
 */
async function openPhotoSwipe(container: Element, clickedImg: HTMLImageElement): Promise<void> {
  // Prevent double-opening
  if (isOpening || photoSwipeInstance) {
    return;
  }

  isOpening = true;

  try {
    // Dynamically import PhotoSwipe
    const { default: PhotoSwipe } = await import('photoswipe');

    // Collect all loaded images as slides
    const slides = collectImageSlides(container);
    if (slides.length === 0) {
      isOpening = false;
      return;
    }

    // Find clicked image index
    const index = findImageIndex(slides, clickedImg);
    if (index === -1) {
      isOpening = false;
      return;
    }

    // Initialize PhotoSwipe
    const pswp = new PhotoSwipe({
      dataSource: slides,
      index,
      // Animation settings - zoom from thumbnail
      showHideAnimationType: 'zoom',
      // Background opacity
      bgOpacity: 0.9,
      // Padding around image
      padding: { top: 20, bottom: 20, left: 20, right: 20 },
      // Enable close on background click
      bgClickAction: 'close',
      // Keyboard bindings
      escKey: true,
      arrowKeys: true,
      // Zoom settings
      wheelToZoom: true,
      // Preload adjacent slides
      preload: [1, 2],

      // === Zoom configuration ===
      // Allow secondary zoom (click to zoom in further)
      allowPanToNext: true,
      // DisAllow loop
      loop: false,
      // Initial zoom level: fit image to viewport
      initialZoomLevel: 'fit',
      // Secondary zoom level: 2x
      secondaryZoomLevel: 1.5,
      // Maximum zoom level: 4x original size
      maxZoomLevel: 4,

      // === UI configuration ===
      arrowPrev: false,
      arrowNext: false,
      // Show zoom button
      zoom: false,
      // Show close button
      close: true,
      counter: false,
    });

    // Store instance reference
    photoSwipeInstance = pswp;

    // Clean up on destroy
    pswp.on('destroy', () => {
      photoSwipeInstance = null;
      isOpening = false;
    });

    // Initialize and open
    pswp.init();
  } catch (error) {
    console.error('[Image Enhancer] Failed to open PhotoSwipe:', error);
    isOpening = false;
  }
}

/**
 * Handle image click for lightbox (using event delegation)
 */
function handleImageClick(container: Element, e: Event): void {
  const target = e.target as HTMLElement;

  // Check if clicked on a loaded markdown image
  if (target.classList.contains('markdown-image') && target.classList.contains('loaded')) {
    const img = target as HTMLImageElement;
    e.preventDefault();
    e.stopPropagation();
    openPhotoSwipe(container, img);
  }
}

/**
 * Create accessible error placeholder for failed images
 */
function createErrorPlaceholder(img: HTMLImageElement): HTMLElement {
  const placeholder = document.createElement('div');
  placeholder.className = 'markdown-image-error';
  placeholder.setAttribute('role', 'img');
  placeholder.setAttribute('aria-label', img.alt ? `图片加载失败: ${img.alt}` : '图片加载失败');

  // Icon
  const icon = document.createElement('span');
  icon.className = 'markdown-image-error-icon';
  icon.setAttribute('aria-hidden', 'true');

  // Text
  const text = document.createElement('span');
  text.className = 'markdown-image-error-text';
  text.textContent = '图片加载失败';

  placeholder.appendChild(icon);
  placeholder.appendChild(text);

  return placeholder;
}

/**
 * Main enhancement function
 */
export function enhanceImages(container: Element): void {
  const images = container.querySelectorAll<HTMLImageElement>('.markdown-image');
  let loadedCount = 0;
  const totalImages = images.length;

  // Only bind click listener once per container
  if (!boundContainers.has(container)) {
    container.addEventListener('click', (e) => handleImageClick(container, e));
    boundContainers.add(container);
  }

  const checkAllLoaded = () => {
    loadedCount++;
    if (loadedCount >= totalImages) {
      // All images processed, group portrait images
      groupPortraitImages(container);
    }
  };

  images.forEach((img) => {
    // Skip if already enhanced (using WeakSet for SPA compatibility)
    if (enhancedImages.has(img)) {
      checkAllLoaded();
      return;
    }
    enhancedImages.add(img);

    // Check if already loaded (cached images)
    if (img.complete && img.naturalWidth > 0) {
      handleImageLoaded(img);
      checkAllLoaded();
      return;
    }

    // Check if already errored (broken image)
    if (img.complete && img.naturalWidth === 0) {
      handleImageError(img);
      checkAllLoaded();
      return;
    }

    // Handle load event
    img.addEventListener(
      'load',
      () => {
        handleImageLoaded(img);
        checkAllLoaded();
      },
      { once: true },
    );

    // Handle error event
    img.addEventListener(
      'error',
      () => {
        handleImageError(img);
        checkAllLoaded();
      },
      { once: true },
    );
  });

  // If no images, still run grouping (in case of pre-marked portraits)
  if (totalImages === 0) {
    groupPortraitImages(container);
  }
}

function handleImageLoaded(img: HTMLImageElement): void {
  img.classList.add('loaded');

  // Mark portrait images (height > width * 1.2 to ensure clearly portrait)
  const isPortrait = img.naturalHeight > img.naturalWidth * 1.2;
  if (isPortrait) {
    img.closest('.markdown-image-wrapper')?.classList.add('portrait');
  }

  // Set cursor style to indicate clickable
  img.style.cursor = 'zoom-in';
}

function handleImageError(img: HTMLImageElement): void {
  img.classList.add('error');

  // Add accessible error placeholder
  const wrapper = img.closest('.markdown-image-wrapper');
  if (wrapper && !wrapper.querySelector('.markdown-image-error')) {
    const placeholder = createErrorPlaceholder(img);
    wrapper.appendChild(placeholder);
  }
}

/**
 * Group consecutive portrait images side by side
 */
function groupPortraitImages(container: Element): void {
  const allWrappers = Array.from(container.querySelectorAll('.markdown-image-wrapper'));

  let currentGroup: Element[] = [];

  const flushGroup = () => {
    if (currentGroup.length >= 2) {
      // Create a row container
      const row = document.createElement('div');
      row.className = 'markdown-image-row';

      // Insert row before first image in group
      currentGroup[0].parentNode?.insertBefore(row, currentGroup[0]);

      // Use DocumentFragment for batch DOM operations
      const fragment = document.createDocumentFragment();
      currentGroup.forEach((wrapper) => {
        fragment.appendChild(wrapper);
      });
      row.appendChild(fragment);
    }
    currentGroup = [];
  };

  allWrappers.forEach((wrapper, index) => {
    const isPortrait = wrapper.classList.contains('portrait');
    // Skip if already in a row
    if (wrapper.parentElement?.classList.contains('markdown-image-row')) return;

    if (isPortrait) {
      const prevWrapper = allWrappers[index - 1];

      // Check if this wrapper is immediately after the previous portrait
      if (
        currentGroup.length > 0 &&
        prevWrapper &&
        prevWrapper.classList.contains('portrait') &&
        isConsecutiveSibling(prevWrapper, wrapper)
      ) {
        currentGroup.push(wrapper);
      } else {
        flushGroup();
        currentGroup = [wrapper];
      }
    } else {
      flushGroup();
    }
  });

  flushGroup();
}

/**
 * Check if two elements are consecutive siblings (allowing text nodes between)
 */
function isConsecutiveSibling(el1: Element, el2: Element): boolean {
  let next = el1.nextSibling;
  while (next) {
    // Skip empty text nodes
    if (next.nodeType === Node.TEXT_NODE && next.textContent?.trim() === '') {
      next = next.nextSibling;
      continue;
    }
    return next === el2;
  }
  return false;
}
