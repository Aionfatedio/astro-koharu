/**
 * Current-page search result activation for Pagefind Component UI.
 *
 * When a search result points at the page the reader is already on, a full
 * navigation would reload the page just to append `?q=`. Instead we close the
 * dialog, push the query param into history and run the highlight pass in
 * place (see @lib/search-highlight).
 *
 * The searchbox activates results through two independent paths, so both are
 * intercepted in the capture phase while the dialog is open:
 * - mouse: results are whole-card `<a class="pf-searchbox-result">` links,
 *   so a plain `preventDefault()` on the click stops the navigation
 * - keyboard: Enter runs the component's `activateCurrentSelection`, which
 *   assigns `window.location.href` directly (no click event) — the capture
 *   handler must also stop propagation so that handler never runs
 */

import { runSearchHighlight } from '@lib/search-highlight';
import { closeModal } from '@store/modal';
import { useEffect } from 'react';

const RESULT_LINK_SELECTOR = 'a.pf-searchbox-result';
const SELECTED_RESULT_SELECTOR = `${RESULT_LINK_SELECTOR}[aria-selected="true"]`;

function normalizePathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
}

function isCurrentPageSearchResult(link: HTMLAnchorElement): boolean {
  const targetUrl = new URL(link.href, window.location.href);

  return (
    targetUrl.origin === window.location.origin &&
    normalizePathname(targetUrl.pathname) === normalizePathname(window.location.pathname) &&
    targetUrl.searchParams.has('q')
  );
}

function activateCurrentPageSearchResult(link: HTMLAnchorElement): boolean {
  if (!isCurrentPageSearchResult(link)) return false;

  const targetUrl = new URL(link.href, window.location.href);

  closeModal();
  if (targetUrl.href !== window.location.href) {
    window.history.pushState(window.history.state, '', targetUrl.href);
  }
  runSearchHighlight();

  return true;
}

export function useSearchResultActivation(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return;

    const handleClickCapture = (event: MouseEvent) => {
      // New-tab intents keep the browser's default behavior
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      const link = target?.closest<HTMLAnchorElement>(RESULT_LINK_SELECTOR);
      if (!link?.href) return;

      if (activateCurrentPageSearchResult(link)) {
        event.preventDefault();
      }
    };

    const handleEnterCapture = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const link = document.querySelector<HTMLAnchorElement>(SELECTED_RESULT_SELECTOR);
      if (!link?.href) return;

      if (activateCurrentPageSearchResult(link)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    window.addEventListener('click', handleClickCapture, true);
    window.addEventListener('keydown', handleEnterCapture, true);
    return () => {
      window.removeEventListener('click', handleClickCapture, true);
      window.removeEventListener('keydown', handleEnterCapture, true);
    };
  }, [isOpen]);
}
