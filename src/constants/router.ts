// Import YAML config directly - processed by @rollup/plugin-yaml

import { normalizeSiteYamlConfig, RESERVED_ROUTE_SLUGS } from '@lib/config/normalize';
import type { RouterItem } from '@lib/config/types';
import rawYamlConfig from '../../config/site.yaml';

export type Router = RouterItem;

// Routes enum kept for backwards compatibility
export enum Routes {
  Home = '/',
  About = '/about',
  Categories = '/categories',
  Tags = '/tags',
  Friends = '/friends',
  Post = '/post',
  Archives = '/archives',
}

// Reserved routes that cannot be used as series slugs
// Includes: static routes, Astro internals, and potentially dangerous paths
export const RESERVED_ROUTES = new Set<string>(RESERVED_ROUTE_SLUGS);

/**
 * Get the URL path for a featured series
 * @param slug - The series slug (e.g., 'weekly')
 * @returns The full path (e.g., '/weekly')
 */
export function getSeriesPath(slug: string): string {
  return `/${slug}`;
}

/**
 * Check if a slug is reserved (conflicts with existing routes)
 * @param slug - The slug to check
 * @returns true if the slug is reserved
 */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_ROUTES.has(slug.toLowerCase());
}

/** Fallback navigation used when `config/site.yaml` does not define `navigation`. */
export const DEFAULT_ROUTERS: Router[] = [
  { name: 'Home', path: Routes.Home, icon: 'fa6-solid:house-chimney' },
  { name: 'About', path: Routes.About, icon: 'fa6-regular:circle-user' },
];

export const routers: Router[] = normalizeSiteYamlConfig(rawYamlConfig).navigation;
