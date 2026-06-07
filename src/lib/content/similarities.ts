/**
 * Similarity-based post retrieval utilities
 */

import similarityRaw from '@assets/similarities.json';
import type { BlogPost } from 'types/blog';
import { getPostSlug } from '../route';
import { validateSimilarityDataSlugs } from './generated-assets';

interface SimilarPost {
  slug: string;
  title: string;
  similarity: number;
}

type SimilarityMap = Record<string, SimilarPost[]>;

// Loaded statically at build time (like summaries.json). Generate via
// `pnpm generate:similarities`; a missing file is a hard build error.
const similarityData = similarityRaw as SimilarityMap;
const _hasSimilarityData = Object.keys(similarityData).length > 0;

/** WeakMap cache: reuse slug→post Map when the same allPosts array reference is passed */
const slugToPostCache = new WeakMap<BlogPost[], Map<string, BlogPost>>();

function getSlugToPostMap(allPosts: BlogPost[]): Map<string, BlogPost> {
  let map = slugToPostCache.get(allPosts);
  if (!map) {
    map = new Map();
    for (const post of allPosts) {
      const slug = getPostSlug(post);
      map.set(slug, post);
    }
    slugToPostCache.set(allPosts, map);
  }
  return map;
}

/**
 * Get related post slugs for a given post
 * @param currentSlug Current post's slug (from post.data.link or post.slug)
 * @param count Number of related posts to return
 * @returns Array of similar post data with similarity scores
 */
export function getRelatedPostSlugs(currentSlug: string, count: number = 5): SimilarPost[] {
  const exactMatch = similarityData[currentSlug];
  return exactMatch ? exactMatch.slice(0, count) : [];
}

/** Validate generated similarity data once per allPosts reference (build-time fail-fast). */
const validatedPostArrays = new WeakSet<BlogPost[]>();

/**
 * Get related posts with full post data
 * @param currentPost Current post
 * @param allPosts All available posts
 * @param count Number of related posts to return
 * @returns Array of BlogPost objects sorted by similarity
 */
export function getRelatedPosts(currentPost: BlogPost, allPosts: BlogPost[], count: number = 5): BlogPost[] {
  // Validate generated data once per allPosts reference. allPosts comes from the
  // memoized getSortedPosts(), so this runs once per build instead of once per page.
  if (!validatedPostArrays.has(allPosts)) {
    validateSimilarityDataSlugs(similarityData, allPosts);
    validatedPostArrays.add(allPosts);
  }

  const relatedSlugs = getRelatedPostSlugs(getPostSlug(currentPost), count);
  if (!relatedSlugs.length) return [];

  // Reuse cached slug→post map (built once per allPosts reference)
  const slugToPost = getSlugToPostMap(allPosts);

  // Map related slugs to full posts, maintaining similarity order
  const relatedPosts: BlogPost[] = [];
  for (const { slug } of relatedSlugs) {
    const post = slugToPost.get(slug);
    if (post) relatedPosts.push(post);
  }

  return relatedPosts;
}

/**
 * Check if similarity data is available
 */
export function hasSimilarityData(): boolean {
  return _hasSimilarityData;
}
