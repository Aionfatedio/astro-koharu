import type { Page } from 'astro';

/** Pagination metadata consumed by the paginator UI. */
export type PaginationInfo = Pick<Page<unknown>, 'currentPage' | 'lastPage' | 'url'>;
