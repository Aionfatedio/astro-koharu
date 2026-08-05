/**
 * useIsDarkTheme Hook
 *
 * Hook for detecting the current page theme state by monitoring
 * the `dark` class on `document.documentElement`.
 * Uses useSyncExternalStore for optimal React 18+ compatibility.
 *
 * This hook monitors the active page theme, which can be manually toggled
 * independently of the user's system preference.
 *
 * @example
 * ```tsx
 * function Component() {
 *   const isDark = useIsDarkTheme();
 *   return <div>{isDark ? 'Dark Mode' : 'Light Mode'}</div>;
 * }
 * ```
 */

import { useSyncExternalStore } from 'react';

/**
 * Hook for detecting current page theme
 *
 * @returns Whether the page is currently in dark mode
 */
export function useIsDarkTheme(): boolean {
  return useSyncExternalStore(
    (callback) => {
      // Ensure we're in browser environment
      if (typeof document === 'undefined') {
        return () => {};
      }

      const observer = new MutationObserver(callback);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });
      return () => observer.disconnect();
    },
    () => {
      // Get current snapshot
      if (typeof document === 'undefined') {
        return false;
      }
      return document.documentElement.classList.contains('dark');
    },
    () => false, // SSR snapshot - always false
  );
}
