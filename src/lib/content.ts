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
  addCategoryRecursively,
  buildCategoryLink,
  buildCategoryPath,
  getCategoryByLink,
  getCategoryLinks,
  getCategoryList,
  getCategoryNameByLink,
  getCategoryPaths,
  getCategorySlug,
  getParentCategory,
} from './content/categories';
export type { PostSummarySource, ResolvedPostSummary } from './content/posts';
// =============================================================================
// Post Utilities
// =============================================================================
export {
  // Core post functions
  getAdjacentSeriesPosts,
  // Featured series functions
  getEnabledSeries,
  getFeaturedCategoryNames,
  getHomeHighlightedPosts,
  getHomePagePosts,
  getNonFeaturedPosts,
  getNonFeaturedPostsBySticky,
  getPostById,
  getPostCount,
  getPostDescription,
  getPostDescriptionWithSummary,
  getPostLastCategory,
  getPostReadingTime,
  getPostSummary,
  getPostsByCategoryName,
  getPostsByCategoryPath,
  getPostsBySeriesSlug,
  getPostsBySticky,
  getSeriesBySlug,
  getSeriesPosts,
  getSortedPosts,
  resolvePostSummary,
} from './content/posts';
// =============================================================================
// Tag Utilities
// =============================================================================
export { buildTagPath, getAllTags, normalizeTag, tagToSlug } from './content/tags';
// =============================================================================
// Types
// =============================================================================
export type { Category, CategoryListResult } from './content/types';
