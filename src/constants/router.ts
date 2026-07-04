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

export const routers: Router[] = normalizeSiteYamlConfig(rawYamlConfig).navigation;
