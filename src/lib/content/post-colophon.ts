/**
 * Site-bound colophon resolution with build-time warnings.
 * Pure resolution logic lives in `./colophon`.
 */

import { colophonConfig } from '@lib/config/site';
import type { BlogPost } from 'types/blog';
import { type ColophonItem, resolvePostColophon } from './colophon';

const warned = new Set<string>();

/** Resolve a post's marks, logging each config warning once per post at build time. */
export function getPostColophon(post: BlogPost): ColophonItem[] {
  const { items, warnings } = resolvePostColophon(post.data.colophon, colophonConfig);
  for (const warning of warnings) {
    const key = `${post.id}:${warning}`;
    if (warned.has(key)) continue;
    warned.add(key);
    console.warn(`[colophon] ${post.id}: ${warning}`);
  }
  return items;
}
