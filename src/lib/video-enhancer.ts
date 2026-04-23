/**
 * Video enhancement with Artplayer
 * Lazily initializes Artplayer instances for video containers in the document
 */

import type Artplayer from 'artplayer';
import { $activePlayerId } from '../store/player';

interface PlayerInitState {
  cancelled: boolean;
  observer?: IntersectionObserver;
}

interface LocalVideoMetadata {
  video?: {
    fps?: number;
    bitrate?: number;
  };
  format?: {
    bitrate?: number;
  };
}

const LAZY_LOAD_ROOT_MARGIN = '400px 0px';
const VIDEO_PLAYER_ID_PREFIX = 'video-artplayer';

let nextVideoPlayerId = 0;

// Track queued, initializing, and initialized containers to avoid duplicate processing
const trackedContainers = new WeakSet<Element>();

// Store Artplayer instances for cleanup
const playerInstances = new Map<Element, Artplayer>();

// Store pending observer/initialization state for cleanup before the Artplayer instance exists
const playerInitStates = new WeakMap<Element, PlayerInitState>();

// Store media mutex cleanup callbacks for initialized players
const playerMediaCleanups = new WeakMap<Element, () => void>();

// Store stable global media player ids for each video container
const videoPlayerIds = new WeakMap<Element, string>();

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
    return '2K FHD';
  }
  if (maxDimension >= 1920 || minDimension >= 1080) {
    return '1080P HD';
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
async function initializePlayer(container: Element, state: PlayerInitState): Promise<void> {
  if (shouldAbortInitialization(container, state)) return;

  const src = container.getAttribute('data-video-src');
  if (!src) {
    console.warn('[Video Enhancer] Missing video URL for container');
    releaseInitialization(container, state);
    return;
  }

  const poster = container.getAttribute('data-video-poster') || '';
  const autoplay = container.getAttribute('data-video-autoplay') === 'true';
  const loop = container.getAttribute('data-video-loop') === 'true';
  const muted = container.getAttribute('data-video-muted') === 'true';

  try {
    // Dynamically import Artplayer to reduce initial bundle size
    const { default: ArtplayerClass } = await import('artplayer');
    if (shouldAbortInitialization(container, state)) return;

    // Ensure ArtPlayer styles exist in the document
    // View Transitions may remove dynamically injected <style> tags from <head>
    const styleId = 'artplayer-style';
    if (!document.getElementById(styleId) && ArtplayerClass.STYLE) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = ArtplayerClass.STYLE;
      document.head.appendChild(style);
    }

    const player = new ArtplayerClass({
      container: container as HTMLDivElement,
      url: src,

      // Poster image
      ...(poster && { poster }),

      // Playback behavior
      autoplay,
      muted: muted || autoplay, // autoplay requires muted
      loop,
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
    if (playerInitStates.get(container) === state) {
      playerInitStates.delete(container);
    }

    setupGlobalMediaMutex(container, player);
    setupLocalVideoMetadataInfo(container, player);

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
      if (player.theme !== newTheme) {
        player.theme = newTheme;
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
    if (!state.cancelled) {
      console.error('[Video Enhancer] Failed to initialize Artplayer:', error);
    }
    releaseInitialization(container, state);
  }
}

/**
 * Get a stable id for the video container in the global media mutex store.
 */
function getVideoPlayerId(container: Element): string {
  const existingId = videoPlayerIds.get(container);
  if (existingId) return existingId;

  nextVideoPlayerId += 1;
  const id = `${VIDEO_PLAYER_ID_PREFIX}-${nextVideoPlayerId}`;
  videoPlayerIds.set(container, id);
  return id;
}

/**
 * Connect Artplayer playback to the site's global audio/video mutex.
 */
function setupGlobalMediaMutex(container: Element, player: Artplayer): void {
  const playerId = getVideoPlayerId(container);
  let cleaned = false;

  const markActive = () => {
    if (cleaned) return;
    if ($activePlayerId.get() !== playerId) {
      $activePlayerId.set(playerId);
    }
  };

  const clearActive = () => {
    if (cleaned) return;
    if ($activePlayerId.get() === playerId) {
      $activePlayerId.set(null);
    }
  };

  const unsubscribe = $activePlayerId.listen((activeId) => {
    if (cleaned || !activeId || activeId === playerId || !player.playing) return;
    player.pause();
  });

  player.on('video:play', markActive);
  player.on('video:playing', markActive);
  player.on('video:pause', clearActive);
  player.on('video:ended', clearActive);

  const cleanup = () => {
    if (cleaned) return;
    unsubscribe();
    clearActive();
    cleaned = true;
    playerMediaCleanups.delete(container);
  };

  playerMediaCleanups.set(container, cleanup);
  player.on('destroy', cleanup);

  if (player.playing) {
    markActive();
  }
}

/**
 * Resolve local video sidecar metadata URL. Network resources are skipped.
 */
function getLocalVideoMetadataUrl(container: Element): string | null {
  if (typeof window === 'undefined') return null;

  const rawSrc = container.getAttribute('data-video-src');
  if (!rawSrc) return null;

  let url: URL;
  try {
    url = new URL(rawSrc, window.location.href);
  } catch {
    return null;
  }

  if (url.origin !== window.location.origin) return null;
  if (!url.pathname.toLowerCase().startsWith('/media/')) return null;

  return `${url.pathname}.json`;
}

function formatFrameRate(fps: number): string {
  return fps.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function formatBitrate(bitsPerSecond: number): string {
  if (bitsPerSecond >= 1_000_000) {
    return `${(bitsPerSecond / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} Mbps`;
  }

  if (bitsPerSecond >= 1_000) {
    return `${(bitsPerSecond / 1_000).toLocaleString(undefined, { maximumFractionDigits: 1 })} Kbps`;
  }

  return `${bitsPerSecond.toLocaleString()} bps`;
}

function appendInfoItem(panel: HTMLElement, title: string, content: string): void {
  const item = document.createElement('div');
  item.className = 'art-info-item art-info-item-local-metadata';

  const titleElement = document.createElement('div');
  titleElement.className = 'art-info-title';
  titleElement.textContent = title;

  const contentElement = document.createElement('div');
  contentElement.className = 'art-info-content';
  contentElement.textContent = content;

  item.append(titleElement, contentElement);
  panel.append(item);
}

/**
 * Add precise local-video metadata from generated sidecar JSON to Artplayer's info panel.
 */
async function setupLocalVideoMetadataInfo(container: Element, player: Artplayer): Promise<void> {
  const metadataUrl = getLocalVideoMetadataUrl(container);
  if (!metadataUrl) return;

  const controller = new AbortController();
  let destroyed = false;

  player.on('destroy', () => {
    destroyed = true;
    controller.abort();
  });

  try {
    const response = await fetch(metadataUrl, { signal: controller.signal });
    if (!response.ok) return;

    const metadata = (await response.json()) as LocalVideoMetadata;
    if (destroyed) return;

    const panel = player.query<HTMLElement>('.art-info-panel');
    if (!panel) return;

    const fps = metadata.video?.fps;
    if (typeof fps === 'number' && Number.isFinite(fps) && fps > 0) {
      appendInfoItem(panel, 'Video framerate:', formatFrameRate(fps));
    }

    const bitrate = metadata.video?.bitrate ?? metadata.format?.bitrate;
    if (typeof bitrate === 'number' && Number.isFinite(bitrate) && bitrate > 0) {
      appendInfoItem(panel, 'Video bitrate:', formatBitrate(bitrate));
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    console.warn('[Video Enhancer] Failed to load local video metadata:', error);
  }
}

/**
 * Release pending initialization state. Keeps a newer state intact if the same
 * element was re-enhanced after cleanup.
 */
function releaseInitialization(container: Element, state: PlayerInitState): void {
  state.observer?.disconnect();
  if (playerInitStates.get(container) === state) {
    playerInitStates.delete(container);
    trackedContainers.delete(container);
  }
}

/**
 * Check whether an async initialization should stop before touching the DOM.
 */
function shouldAbortInitialization(container: Element, state: PlayerInitState): boolean {
  if (!state.cancelled && container.isConnected) return false;
  releaseInitialization(container, state);
  return true;
}

/**
 * Queue player initialization until the video is near the viewport.
 */
function queuePlayerInitialization(container: Element): void {
  if (trackedContainers.has(container)) return;

  const state: PlayerInitState = { cancelled: false };
  trackedContainers.add(container);
  playerInitStates.set(container, state);

  if (!container.isConnected) {
    releaseInitialization(container, state);
    return;
  }

  if (typeof IntersectionObserver === 'undefined') {
    initializePlayer(container, state);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const shouldInitialize = entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0);
      if (!shouldInitialize) return;

      observer.disconnect();
      state.observer = undefined;
      initializePlayer(container, state);
    },
    {
      rootMargin: LAZY_LOAD_ROOT_MARGIN,
      threshold: 0.01,
    },
  );

  state.observer = observer;
  observer.observe(container);
}

/**
 * Destroy a player instance
 */
function destroyPlayer(container: Element): void {
  const state = playerInitStates.get(container);
  if (state) {
    state.cancelled = true;
    state.observer?.disconnect();
    playerInitStates.delete(container);
  }

  const player = playerInstances.get(container);
  if (player) {
    playerMediaCleanups.get(container)?.();
    player.destroy(true); // true = remove all generated HTML DOM
    playerInstances.delete(container);
  }
  trackedContainers.delete(container);
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
    queuePlayerInitialization(videoContainer);
  });
}

/**
 * Cleanup function for page transitions
 */
export function cleanupVideos(container: Element): void {
  destroyAllPlayers(container);
}
