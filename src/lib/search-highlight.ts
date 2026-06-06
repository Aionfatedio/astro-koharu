/**
 * Search-result highlighting + center-scroll on article pages.
 *
 * Arriving from the search dialog, each result link carries a `?q=<terms>`
 * query param (configured via Pagefind's `highlightParam` in SearchPortal). On the
 * target article we load Pagefind's official highlight script (mark.js based), which
 * wraps every matched term in `<mark class="pagefind-highlight">`, then scroll the
 * first match to the viewport center.
 *
 * Centering has to survive *post-scroll layout growth*: much of a feature-heavy
 * article renders only after navigation settles — code blocks enhanced by a
 * `client:idle` React island, lazy images, video players, link/embed cards — and
 * all of it grows the layout ABOVE the target, pushing it off-center (measured
 * ~700px on the shoka-features post). Rather than waiting on, or coupling to, each
 * component, we center once and let a ResizeObserver keep the target centered
 * through every layout change, until the reader takes over. This reacts to real
 * layout + interaction events only: no timers, no magic delays, no per-component
 * knowledge — so any future content component is handled automatically.
 *
 * A `?q=` link only ever points at an indexed page; encrypted posts are
 * excluded from the index, and `markContext` is scoped to the post body, so the
 * encrypted (empty-text) container is never touched.
 */

const HIGHLIGHT_PARAM = 'q';
const PAGEFIND_BODY = '[data-pagefind-body]';
// User gestures that mean "I'm taking over scrolling" — NOT `scroll`, which our own
// programmatic re-centering would fire, releasing control prematurely.
const RELEASE_EVENTS = ['wheel', 'touchstart', 'keydown'] as const;

declare global {
  interface Window {
    PagefindHighlight: new (options: {
      highlightParam: string;
      markContext?: string | Element | Element[] | NodeList;
      addStyles?: boolean;
    }) => unknown;
  }
}

const nextFrame = (): Promise<void> => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function highlightAndScroll(): Promise<void> {
  if (!new URLSearchParams(window.location.search).has(HIGHLIGHT_PARAM)) return;

  const body = document.querySelector(PAGEFIND_BODY);
  if (!body) return;

  // Pagefind's highlighter lives in the build-time /pagefind bundle, so its path is
  // resolved at runtime and must bypass Vite's static import analysis. Importing it
  // attaches `window.PagefindHighlight` as a side effect.
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  await import(/* @vite-ignore */ `${base}/pagefind/pagefind-highlight.js`);

  // We own the visual style via `.pagefind-highlight`, so disable the script's inline styles.
  new window.PagefindHighlight({ highlightParam: HIGHLIGHT_PARAM, markContext: PAGEFIND_BODY, addStyles: false });

  // Let the just-inserted marks lay out (and async webfonts settle) before centering.
  await document.fonts.ready;
  await nextFrame();
  await nextFrame();

  const first = body.querySelector<HTMLElement>('.pagefind-highlight');
  if (!first) return;

  // Instant centering (not smooth): the target can be thousands of px down, and the
  // observer below re-centers on every layout change — a smooth animation would fight it.
  const recenter = () => first.scrollIntoView({ block: 'center' });
  recenter();

  // Keep the target centered while async content above it grows the layout, then
  // hand control back the moment the reader scrolls/types, and on navigation away.
  const observer = new ResizeObserver(recenter);
  observer.observe(body);

  const release = () => {
    observer.disconnect();
    for (const ev of RELEASE_EVENTS) window.removeEventListener(ev, release);
    document.removeEventListener('astro:before-swap', release);
  };
  for (const ev of RELEASE_EVENTS) window.addEventListener(ev, release, { passive: true, once: true });
  document.addEventListener('astro:before-swap', release, { once: true });
}

export function initSearchHighlight(): void {
  document.addEventListener('astro:page-load', highlightAndScroll);
}
