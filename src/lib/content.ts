/**
 * Content utilities - barrel file
 *
 * Re-exports all content-related utilities from the modular files under
 * content/, providing a single `@lib/content` import surface.
 */

// =============================================================================
// Category Utilities
// =============================================================================
export {
  buildCategoryPath,
  getCategoryByLink,
  getCategoryLinks,
  getCategoryList,
  getCategoryPaths,
  getParentCategory,
} from './content/categories';
export type { PostSummarySource, ResolvedPostSummary } from './content/posts';
// =============================================================================
// Post Utilities
// =============================================================================
export {
  // Featured series functions
  getEnabledSeries,
  getHomePagePosts,
  getNonFeaturedPosts,
  getPostCount,
  getPostDescription,
  getPostLastCategory,
  getPostsByCategoryName,
  getPostsByCategoryPath,
  getSortedPosts,
  resolvePostSummary,
} from './content/posts';
// =============================================================================
// Tag Utilities
// =============================================================================
export { buildTagPath, getAllTags, normalizeTag } from './content/tags';
// =============================================================================
// Types
// =============================================================================
export type { Category, CategoryListResult } from './content/types';
