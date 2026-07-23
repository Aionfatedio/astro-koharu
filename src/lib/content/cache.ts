/**
 * Build-time memoization cache for content queries.
 *
 * During Astro SSG builds, every page runs in the same Node.js process.
 * A module-level Map therefore persists for the entire build and can
 * eliminate redundant sort/filter operations (e.g. getSortedPosts called
 * 2000+ times across ~300 post pages).
 *
 * No invalidation is needed — the cache lives exactly as long as the build.
 */

const caches = new Map<string, Map<string, Promise<unknown>>>();

/**
 * Return a cached value or compute & store it.
 * @param namespace - Logical group (e.g. 'sortedPosts', 'categoryList')
 * @param key       - Discriminator within the group
 * @param fn        - Async factory that produces the value on cache miss
 */
export async function memoize<T>(namespace: string, key: string, fn: () => Promise<T>): Promise<T> {
  // In dev mode, Astro's own getCollection invalidates on file changes,
  // but this module-level cache persists across HMR — skip it to avoid stale data.
  if (import.meta.env.DEV) return fn();

  let cache = caches.get(namespace);
  if (!cache) {
    cache = new Map();
    caches.set(namespace, cache);
  }
  const cached = cache.get(key);
  if (cached) return cached as Promise<T>;

  // Store the in-flight promise before awaiting it. Several routes can ask for
  // the same collection during one build; caching only the resolved value lets
  // those concurrent calls repeat the full query and sort work.
  const pending = fn().catch((error: unknown) => {
    cache?.delete(key);
    throw error;
  });
  cache.set(key, pending);
  return pending;
}
