/**
 * Content-related type definitions
 */

export type Category = {
  name: string;
  /** URL slug for this category segment. */
  slug: string;
  /** Full category name path from root to this category. */
  path: string[];
  /** URL path relative to /categories, without leading slash. */
  link: string;
  children?: Category[];
};

export type CategoryListResult = {
  categories: Category[];
  countMap: { [key: string]: number };
};
