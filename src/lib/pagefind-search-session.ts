/**
 * Session-scoped Pagefind dialog state.
 *
 * The browser clears sessionStorage when the tab session ends, which matches the
 * search dialog's requirement: keep progress while the page session is alive.
 */

export const PAGEFIND_SEARCH_INPUT_SELECTOR = '.pagefind-ui__search-input';
export const SEARCH_DIALOG_SCROLL_AREA_ID = 'search-dialog-scroll-area';

const STORAGE_KEY = 'koharu:pagefind-search-session:v1';

export interface PagefindSearchSession {
  query: string;
  scrollTop: number;
}

function createInitialSearchSession(): PagefindSearchSession {
  return {
    query: '',
    scrollTop: 0,
  };
}

function getSessionStorage(): Storage {
  if (typeof window === 'undefined') {
    throw new Error('Pagefind search session is only available in the browser.');
  }
  return window.sessionStorage;
}

function assertSearchSession(value: unknown): asserts value is PagefindSearchSession {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid Pagefind search session: expected an object.');
  }

  const session = value as Record<string, unknown>;
  if (typeof session.query !== 'string') {
    throw new Error('Invalid Pagefind search session: "query" must be a string.');
  }
  if (typeof session.scrollTop !== 'number' || !Number.isFinite(session.scrollTop) || session.scrollTop < 0) {
    throw new Error('Invalid Pagefind search session: "scrollTop" must be a non-negative finite number.');
  }
}

export function readPagefindSearchSession(): PagefindSearchSession {
  const stored = getSessionStorage().getItem(STORAGE_KEY);
  if (stored === null) return createInitialSearchSession();

  const parsed: unknown = JSON.parse(stored);
  assertSearchSession(parsed);
  return parsed;
}

export function writePagefindSearchSession(session: PagefindSearchSession): void {
  assertSearchSession(session);
  getSessionStorage().setItem(STORAGE_KEY, JSON.stringify(session));
}

export function updatePagefindSearchSession(patch: Partial<PagefindSearchSession>): PagefindSearchSession {
  const nextSession = {
    ...readPagefindSearchSession(),
    ...patch,
  };
  writePagefindSearchSession(nextSession);
  return nextSession;
}

export function applyPagefindSearchQuery(input: HTMLInputElement, query: string): void {
  if (input.value === query) return;

  input.value = query;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
