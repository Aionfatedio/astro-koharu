const CARD_LINK_SELECTOR = '[data-post-card-href]';
const INTERACTIVE_TARGET_SELECTOR = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
].join(',');

let navigationController: AbortController | null = null;

function hasActiveTextSelection(): boolean {
  const selection = window.getSelection();
  return selection !== null && !selection.isCollapsed;
}

function getEventTarget(event: MouseEvent): Element | null {
  return event.target instanceof Element ? event.target : null;
}

function getNavigableCard(event: MouseEvent): HTMLElement | null {
  if (event.defaultPrevented || hasActiveTextSelection()) return null;

  const target = getEventTarget(event);
  if (target === null || target.closest(INTERACTIVE_TARGET_SELECTOR) !== null) return null;

  return target.closest<HTMLElement>(CARD_LINK_SELECTOR);
}

function openInNewContext(href: string): void {
  window.open(href, '_blank', 'noopener');
}

function handlePostCardClick(event: MouseEvent): void {
  if (event.button !== 0) return;

  const card = getNavigableCard(event);
  const href = card?.dataset.postCardHref;
  if (href === undefined) return;

  // Match native link modifier semantics: ctrl/cmd/shift open a new context.
  if (event.metaKey || event.ctrlKey || event.shiftKey) {
    openInNewContext(href);
    return;
  }

  window.location.assign(href);
}

function handlePostCardAuxClick(event: MouseEvent): void {
  if (event.button !== 1) return;

  const card = getNavigableCard(event);
  const href = card?.dataset.postCardHref;
  if (href === undefined) return;

  event.preventDefault();
  openInNewContext(href);
}

export function cleanupPostCardNavigation(): void {
  navigationController?.abort();
  navigationController = null;
}

export function initPostCardNavigation(): void {
  cleanupPostCardNavigation();

  navigationController = new AbortController();
  document.addEventListener('click', handlePostCardClick, { signal: navigationController.signal });
  document.addEventListener('auxclick', handlePostCardAuxClick, { signal: navigationController.signal });
}
