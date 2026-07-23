/**
 * useSearchKeyboardNav Hook
 *
 * Manages keyboard navigation for search results (ArrowUp/Down, Enter).
 * Tracks selected index, handles DOM selection highlighting, and
 * observes result mutations to reset selection. Also delegates mouse
 * clicks so the whole result card (not just the title link) navigates.
 *
 * Extracted from SearchDialog to keep component under 300 lines.
 */

import { runSearchHighlight } from '@lib/search-highlight';
import { closeModal } from '@store/modal';
import { useEffect, useRef } from 'react';

/**
 * Get selectable items from the Pagefind search results DOM
 */
function getSelectableItems(): HTMLElement[] {
  const results = Array.from(document.querySelectorAll('.pagefind-ui__result')) as HTMLElement[];
  const loadMoreBtn = document.querySelector('.pagefind-ui__button') as HTMLElement | null;
  if (loadMoreBtn && loadMoreBtn.offsetParent !== null) {
    return [...results, loadMoreBtn];
  }
  return results;
}

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

export function useSearchKeyboardNav(isOpen: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedIndexRef = useRef(-1);
  const observerRef = useRef<MutationObserver | null>(null);

  useEffect(() => {
    if (!isOpen) {
      document
        .querySelectorAll<HTMLElement>('.pagefind-ui__result[data-selected], .pagefind-ui__button[data-selected]')
        .forEach((item) => {
          item.removeAttribute('data-selected');
        });
      selectedIndexRef.current = -1;
      observerRef.current?.disconnect();
      observerRef.current = null;
      return;
    }

    const clearSelection = () => {
      const items = getSelectableItems();
      const idx = selectedIndexRef.current;
      if (idx >= 0 && idx < items.length) {
        items[idx]?.removeAttribute('data-selected');
      }
      selectedIndexRef.current = -1;
    };

    const selectResult = (index: number) => {
      const items = getSelectableItems();
      if (items.length === 0) {
        selectedIndexRef.current = -1;
        return;
      }

      const newIndex = Math.max(-1, Math.min(index, items.length - 1));
      const currentIndex = selectedIndexRef.current;

      // Remove old selection
      if (currentIndex >= 0 && currentIndex < items.length) {
        items[currentIndex]?.removeAttribute('data-selected');
      }

      selectedIndexRef.current = newIndex;

      if (newIndex >= 0) {
        items[newIndex].setAttribute('data-selected', 'true');
        items[newIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        const searchInput = document.querySelector('.pagefind-ui__search-input') as HTMLInputElement;
        searchInput?.focus();
      }
    };

    const navigateToSelected = () => {
      const items = getSelectableItems();
      const currentIndex = selectedIndexRef.current;
      if (currentIndex < 0 || currentIndex >= items.length) return;

      const selectedItem = items[currentIndex];

      if (selectedItem.classList.contains('pagefind-ui__button')) {
        selectedItem.click();
        selectedIndexRef.current = -1;
        return;
      }

      const link = selectedItem.querySelector('.pagefind-ui__result-link') as HTMLAnchorElement;
      if (link?.href) {
        if (activateCurrentPageSearchResult(link)) return;

        closeModal();
        window.location.href = link.href;
      }
    };

    // Keyboard navigation
    const handleKeyDown = (e: KeyboardEvent) => {
      const currentIndex = selectedIndexRef.current;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectResult(currentIndex + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectResult(currentIndex - 1);
      } else if (e.key === 'Enter' && currentIndex >= 0) {
        e.preventDefault();
        navigateToSelected();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Mouse navigation: a click anywhere on a result card activates its link.
    // The title link keeps its own click + hover behavior; this only covers
    // clicks on the rest of the card (excerpt, padding…). Delegated on the
    // container so dynamically loaded results ("load more") are handled too.
    const handleResultClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // The "load more" button keeps its default behavior
      if (target.closest('.pagefind-ui__button')) return;
      const clickedLink = target.closest('.pagefind-ui__result-link') as HTMLAnchorElement | null;
      if (clickedLink) {
        if (activateCurrentPageSearchResult(clickedLink)) {
          e.preventDefault();
        }
        return;
      }
      // Don't hijack an in-progress text selection inside the results
      if (window.getSelection()?.toString()) return;
      const link = target
        .closest('.pagefind-ui__result')
        ?.querySelector('.pagefind-ui__result-link') as HTMLAnchorElement | null;
      if (!link) return;

      if (activateCurrentPageSearchResult(link)) {
        e.preventDefault();
        return;
      }

      link.click();
    };

    // Mutation observer: clear selection when results change
    const container = containerRef.current;
    if (container) {
      container.addEventListener('click', handleResultClick);
      observerRef.current = new MutationObserver(clearSelection);
      observerRef.current.observe(container, { childList: true, subtree: true });
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      container?.removeEventListener('click', handleResultClick);
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [isOpen]);

  return { containerRef };
}
