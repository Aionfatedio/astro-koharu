import type Artplayer from 'artplayer';

interface LocalVideoMetadata {
  video?: {
    fps?: number;
    bitrate?: number;
  };
  format?: {
    bitrate?: number;
  };
}

function getLocalVideoMetadataUrl(container: Element): string | null {
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
export async function setupLocalVideoMetadataInfo(container: Element, player: Artplayer): Promise<void> {
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
