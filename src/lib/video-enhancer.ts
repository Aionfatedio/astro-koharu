/**
 * Video enhancement with Artplayer
 * Initializes Artplayer instances for all video containers in the document
 */

import type Artplayer from 'artplayer';

// Track initialized containers to avoid duplicate processing
const initializedContainers = new WeakSet<Element>();

// Store Artplayer instances for cleanup
const playerInstances = new Map<Element, Artplayer>();

/**
 * Get theme color from CSS variable
 */
function getThemeColor(): string {
  if (typeof document === 'undefined') return '#6366f1';

  const root = document.documentElement;
  const style = getComputedStyle(root);

  // Try to get the primary color HSL values
  const primaryHsl = style.getPropertyValue('--primary').trim();
  if (primaryHsl) {
    return `hsl(${primaryHsl})`;
  }

  // Fallback to a nice purple/indigo color
  return '#6366f1';
}

/**
 * Get quality label based on video resolution
 */
function getQualityLabel(width: number, height: number): string {
  // Use the larger dimension to determine quality (handles both landscape and portrait)
  const maxDimension = Math.max(width, height);
  const minDimension = Math.min(width, height);

  // Check based on standard resolutions
  if (maxDimension >= 3840 || minDimension >= 2160) {
    return '4K UHD';
  }
  if (maxDimension >= 2560 || minDimension >= 1440) {
    return '2K QHD';
  }
  if (maxDimension >= 1920 || minDimension >= 1080) {
    return '1080P FHD';
  }
  if (maxDimension >= 1280 || minDimension >= 720) {
    return '720P HD';
  }
  if (maxDimension >= 854 || minDimension >= 480) {
    return '480P SD';
  }
  if (maxDimension >= 640 || minDimension >= 360) {
    return '360P';
  }
  return `Quality`;
}

/**
 * Initialize a single Artplayer instance
 */
async function initializePlayer(container: Element): Promise<void> {
  if (initializedContainers.has(container)) return;
  initializedContainers.add(container);

  // Get video options from data attributes
  const src = container.getAttribute('data-video-src');
  if (!src) {
    console.warn('[Video Enhancer] Container missing data-video-src attribute');
    return;
  }

  const poster = container.getAttribute('data-video-poster') || '';
  const autoplay = container.getAttribute('data-video-autoplay') === 'true';
  const loop = container.getAttribute('data-video-loop') === 'true';
  const muted = container.getAttribute('data-video-muted') === 'true';

  try {
    // Dynamically import Artplayer to reduce initial bundle size
    const { default: ArtplayerClass } = await import('artplayer');

    const player = new ArtplayerClass({
      container: container as HTMLDivElement,
      url: src,

      // Poster image
      ...(poster && { poster }),

      // Playback behavior
      autoplay: false,
      muted: muted || autoplay, // autoplay requires muted
      loop: false,
      volume: 0.5,

      // Player features
      mutex: true, // Only one player plays at a time
      autoSize: false, // Let CSS handle sizing
      autoMini: false, // Don't auto mini player on scroll
      autoPlayback: false, // Don't remember playback position

      // Theme - use blog primary color
      theme: getThemeColor(),

      // UI Controls

      hotkey: true, // Keyboard shortcuts
      pip: true, // Picture-in-picture
      fullscreen: true, // Fullscreen button
      fullscreenWeb: true, // Web fullscreen (in page)
      setting: true, // Settings panel
      settings: [
        {
          html: '循环播放',
          tooltip: loop ? '开启' : '关闭',
          icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="currentColor" d="M2 5h10v3l4-4l-4-4v3H0v6h2zm12 6H4V8l-4 4l4 4v-3h12V7h-2z"/></svg>',
          switch: loop,
          onSwitch: (item) => {
            const nextState = !item.switch;
            if (player.video) {
              player.video.loop = nextState;
            }
            item.tooltip = nextState ? '开启' : '关闭';
            return nextState;
          },
        },
      ],
      playbackRate: true, // Speed control
      aspectRatio: true, // Aspect ratio options
      flip: true, // Flip video

      // Mobile features
      playsInline: true, // Inline playback on mobile
      lock: true, // Lock button on mobile
      fastForward: true, // Long press fast forward
      autoOrientation: true, // Auto rotate on fullscreen

      // UI refinements
      miniProgressBar: true, // Show mini progress when controls hidden
      backdrop: true, // Blur effect on UI overlays

      // Prevent flash of unstyled content
      useSSR: false,
    });

    // Store instance for cleanup
    playerInstances.set(container, player);

    // Set initial loop state if specified in markdown
    if (loop && player.video) {
      player.video.loop = true;
    }

    // Also set loop when video is ready (in case video element wasn't ready above)
    // And add quality label based on video resolution
    player.on('ready', () => {
      if (loop && player.video) {
        player.video.loop = true;
      }
    });

    // Add quality label control when video metadata is loaded
    player.on('video:loadedmetadata', () => {
      const video = player.video;
      if (video && video.videoWidth > 0 && video.videoHeight > 0) {
        const qualityLabel = getQualityLabel(video.videoWidth, video.videoHeight);

        // Add quality label as a custom control in the control bar
        player.controls.add({
          name: 'quality-label',
          position: 'right',
          index: 1,
          html: `<span class="art-quality-label">${qualityLabel}</span>`,
          style: {
            padding: '0 8px',
            fontSize: '15px',
            fontWeight: '500',
            color: 'rgba(255, 255, 255, 0.9)',
            cursor: 'default',
            userSelect: 'none',
          },
          tooltip: `当前画质: ${video.videoWidth}×${video.videoHeight}`,
          // tooltip: ``,
        });

        // 音量键移动到右侧：Move volume control from left to right (between quality-label and setting)
        const $volume = player.query('.art-control-volume');
        const $rightPanel = player.query('.art-controls-right');
        const $setting = player.query('.art-control-setting');

        if ($volume && $rightPanel && $setting) {
          $rightPanel.insertBefore($volume, $setting);
        }
      }
    });

    // Listen for theme changes
    const observer = new MutationObserver(() => {
      const newTheme = getThemeColor();
      if (player.option.theme !== newTheme) {
        player.option.theme = newTheme;
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });

    // Cleanup observer when player is destroyed
    player.on('destroy', () => {
      observer.disconnect();
      playerInstances.delete(container);
    });
  } catch (error) {
    console.error('[Video Enhancer] Failed to initialize Artplayer:', error);
  }
}

/**
 * Destroy a player instance
 */
function destroyPlayer(container: Element): void {
  const player = playerInstances.get(container);
  if (player) {
    player.destroy(false);
    playerInstances.delete(container);
  }
  initializedContainers.delete(container);
}

/**
 * Destroy all player instances in a container
 */
function destroyAllPlayers(root: Element): void {
  const containers = root.querySelectorAll('.artplayer-container');
  containers.forEach(destroyPlayer);
}

/**
 * Main enhancement function
 * Finds all video containers and initializes Artplayer for each
 */
export function enhanceVideos(container: Element): void {
  const videoContainers = container.querySelectorAll('.artplayer-container');

  videoContainers.forEach((videoContainer) => {
    initializePlayer(videoContainer);
  });
}

/**
 * Cleanup function for page transitions
 */
export function cleanupVideos(container: Element): void {
  destroyAllPlayers(container);
}
