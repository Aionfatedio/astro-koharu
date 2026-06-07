/**
 * Comic reader runtime enhancer.
 *
 * Scans for `.comic-card-container` elements rendered by remark-comic-directive,
 * binds click handlers, and lazily loads ComicReader.umd.js via dynamic <script>
 * injection only when a user clicks a comic card.
 *
 * ComicReader API (window.ComicReadScript):
 *   const reader = initComicReader();
 *   reader.open(imageUrls, title);
 *   reader.setProps('show', false);
 */

interface ComicManifest {
  id: string;
  name: string;
  author?: string;
  cover?: string;
  images: string[];
}

interface ComicReaderInstance {
  open: (urls: string[], title?: string) => void;
  setProps: (key: string, value: unknown) => void;
}

interface ComicReaderInitConfig {
  props?: {
    defaultOption?: {
      pageNum?: 1 | 2 | 0;
      autoSwitchPageMode?: boolean;
    };
    option?: {
      pageNum?: 1 | 2 | 0;
      autoSwitchPageMode?: boolean;
    };
  };
}

interface ComicReadScriptGlobal {
  initComicReader: (config?: ComicReaderInitConfig) => ComicReaderInstance;
}

const enhancedContainers = new WeakSet<Element>();
const listenerMap = new WeakMap<Element, () => void>();

const COMIC_READER_INIT_CONFIG = {
  props: {
    defaultOption: {
      pageNum: 1,
      autoSwitchPageMode: false,
    },
    option: {
      pageNum: 1,
      autoSwitchPageMode: false,
    },
  },
} satisfies ComicReaderInitConfig;

let scriptLoading: Promise<ComicReadScriptGlobal> | null = null;
let readerInstance: ComicReaderInstance | null = null;

/** Dynamically load ComicReader.umd.js via <script> tag (once) */
function loadComicReaderScript(): Promise<ComicReadScriptGlobal> {
  if (scriptLoading) return scriptLoading;

  const existing = (window as unknown as Record<string, unknown>).ComicReadScript as ComicReadScriptGlobal | undefined;
  if (existing?.initComicReader) {
    scriptLoading = Promise.resolve(existing);
    return scriptLoading;
  }

  scriptLoading = new Promise<ComicReadScriptGlobal>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/libs/ComicReader.umd.js';
    script.onload = () => {
      const global = (window as unknown as Record<string, unknown>).ComicReadScript as ComicReadScriptGlobal | undefined;
      if (global?.initComicReader) {
        resolve(global);
      } else {
        reject(new Error('[comic-enhancer] ComicReadScript not found on window after loading'));
      }
    };
    script.onerror = () => reject(new Error('[comic-enhancer] Failed to load ComicReader.umd.js'));
    document.head.appendChild(script);
  });

  return scriptLoading;
}

/** Get or create the singleton reader instance */
async function getReader(): Promise<ComicReaderInstance> {
  if (readerInstance) return readerInstance;
  const comicReadScript = await loadComicReaderScript();
  readerInstance = comicReadScript.initComicReader(COMIC_READER_INIT_CONFIG);
  return readerInstance;
}

/** Handle comic card click: fetch manifest and open reader */
async function openComic(container: HTMLElement): Promise<void> {
  const src = container.dataset.comicSrc;
  const name = container.dataset.comicName || '';

  if (!src) {
    console.warn('[comic-enhancer] No data-comic-src on comic card');
    return;
  }

  try {
    // Fetch manifest to get image list
    const response = await fetch(src);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const manifest: ComicManifest = await response.json();

    if (!manifest.images || manifest.images.length === 0) {
      console.warn(`[comic-enhancer] No images in manifest: ${src}`);
      return;
    }

    // Load reader and open
    const reader = await getReader();
    reader.open(manifest.images, name);
  } catch (error) {
    console.error(`[comic-enhancer] Failed to open comic: ${src}`, error);
  }
}

/** Enhance all comic card containers in the given element */
export function enhanceComics(container: Element): void {
  const cards = container.querySelectorAll<HTMLElement>('.comic-card-container');
  if (cards.length === 0) return;

  for (const card of cards) {
    if (enhancedContainers.has(card)) continue;

    const btn = card.querySelector<HTMLElement>('.comic-card-read-btn');
    if (!btn) continue;

    const handler = () => openComic(card);
    btn.addEventListener('click', handler);
    listenerMap.set(btn, handler);
    enhancedContainers.add(card);
  }
}

/** Cleanup comic card listeners before page swap */
export function cleanupComics(container: Element): void {
  const cards = container.querySelectorAll<HTMLElement>('.comic-card-container');
  for (const card of cards) {
    const btn = card.querySelector<HTMLElement>('.comic-card-read-btn');
    if (btn) {
      const handler = listenerMap.get(btn);
      if (handler) {
        btn.removeEventListener('click', handler);
        listenerMap.delete(btn);
      }
    }
    enhancedContainers.delete(card);
  }
}
