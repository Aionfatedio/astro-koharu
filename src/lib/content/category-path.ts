/**
 * Pure category path/array utilities — no dependency on posts.ts.
 * Extracted to break the circular dependency: posts → categories → posts.
 */

import { categoryMap } from '@lib/config/site';
import { encodeSlug } from '../route';

function assertCategoryNames(categoryNames: string | string[]): string[] {
  const names = Array.isArray(categoryNames) ? categoryNames : [categoryNames];
  if (names.length === 0) {
    throw new Error('Category path cannot be empty.');
  }
  for (const name of names) {
    if (!name || !name.trim()) {
      throw new Error('Category name cannot be empty.');
    }
  }
  return names;
}

/**
 * Resolve a category name to its configured URL slug.
 */
export function getCategorySlug(name: string): string {
  const slug = categoryMap[name];
  if (!slug || !slug.trim()) {
    throw new Error(`Missing categoryMap entry for category "${name}". Add it to config/site.yaml.`);
  }
  return slug;
}

/**
 * Build the URL path relative to /categories from category names.
 */
export function buildCategoryLink(categoryNames: string | string[]): string {
  const names = assertCategoryNames(categoryNames);
  return names.map((name) => encodeSlug(getCategorySlug(name))).join('/');
}

/**
 * Build category path from category names
 * @param categoryNames Array of category names or single category name
 * @returns Category path like "/categories/note/front-end"
 */
export function buildCategoryPath(categoryNames: string | string[]): string {
  return `/categories/${buildCategoryLink(categoryNames)}`;
}

/**
 * Normalize frontmatter category values into category paths.
 */
export function getCategoryPaths(categories?: string[] | string[][]): string[][] {
  if (!categories?.length) return [];
  if (categories.every((category): category is string => typeof category === 'string')) {
    return [categories];
  }
  return categories.filter((categoryPath) => categoryPath.length > 0);
}
