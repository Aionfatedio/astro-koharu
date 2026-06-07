/**
 * Category-related utility functions
 */

import { categoryMap } from '@constants/category';
import { memoize } from './cache';
import { buildCategoryLink, getCategoryPaths, getCategorySlug } from './category-path';
import { getSortedPosts } from './posts';
import type { Category, CategoryListResult } from './types';

// Re-export pure path utilities (defined in category-path.ts to break circular dependency)
export { buildCategoryLink, buildCategoryPath, getCategoryPaths, getCategorySlug } from './category-path';

function createCategory(path: string[]): Category {
  const name = path[path.length - 1];
  return {
    name,
    slug: getCategorySlug(name),
    path: [...path],
    link: buildCategoryLink(path),
  };
}

function ensureCategoryPath(rootCategories: Category[], path: string[]): void {
  let siblings = rootCategories;
  const currentPath: string[] = [];

  for (const name of path) {
    currentPath.push(name);
    const link = buildCategoryLink(currentPath);
    let category = siblings.find((item) => item.link === link);

    if (!category) {
      category = createCategory(currentPath);
      siblings.push(category);
    }

    category.children ??= [];
    siblings = category.children;
  }
}

function findCategoryByLink(categories: Category[], link: string): Category | null {
  for (const category of categories) {
    if (category.link === link) return category;
    if (category.children?.length) {
      const childCategory = findCategoryByLink(category.children, link);
      if (childCategory) return childCategory;
    }
  }
  return null;
}

/**
 * Get hierarchical category list with counts (excluding drafts in production)
 */
export async function getCategoryList(): Promise<CategoryListResult> {
  return memoize('categoryList', '__all__', async () => {
    const allBlogPosts = await getSortedPosts();
    const countMap: { [key: string]: number } = {};
    const resCategories: Category[] = [];

    for (let i = 0; i < allBlogPosts.length; ++i) {
      const post = allBlogPosts[i];
      const { catalog, categories } = post.data;
      if (!catalog || !categories?.length) {
        continue;
      }

      for (const categoryPath of getCategoryPaths(categories)) {
        ensureCategoryPath(resCategories, categoryPath);

        for (let j = 0; j < categoryPath.length; ++j) {
          const partialPath = categoryPath.slice(0, j + 1);
          const link = buildCategoryLink(partialPath);
          countMap[link] = (countMap[link] || 0) + 1;
        }
      }
    }

    return { categories: resCategories, countMap };
  });
}

/**
 * 递归添加子分类 有副作用的函数 如 ['分类1', '分类2', '分类3'] 创建一级分类 '分类1'、二级分类 '分类2'、三级分类 '分类3'
 * @param rootCategories 根分类
 * @param parentNames 父分类名 ['分类1', '分类2']
 * @param name 子分类名 '分类3'
 */
export function addCategoryRecursively(rootCategories: Category[], parentNames: string[], name: string) {
  ensureCategoryPath(rootCategories, [...parentNames, name]);
}

/**
 * 获取分类完整链接
 * @param categories 分类
 * @param parentLink 父分类链接
 * @returns 分类链接
 */
export function getCategoryLinks(categories?: Category[], parentLink?: string): string[] {
  if (!categories?.length) return [];
  const res: string[] = [];
  categories.forEach((category: Category) => {
    res.push(parentLink ? `${parentLink}/${category.slug}` : category.link);
    if (category?.children?.length) {
      const children = getCategoryLinks(category?.children, category.link);
      res.push(...children);
    }
  });
  return res;
}

/**
 * Get category name by link
 * @param link categories/xxx/front-end
 * @returns 前端
 */
export function getCategoryNameByLink(link: string): string {
  if (!link) return '';

  const cleanLink = link.replace(/^\/+|\/+$/g, '');
  if (!cleanLink) return '';

  const segments = cleanLink.split('/').filter(Boolean);
  if (segments.length === 0) return '';

  const lastSegment = decodeURIComponent(segments[segments.length - 1]);
  const match = Object.entries(categoryMap).find(([, slug]) => slug === lastSegment);
  return match?.[0] ?? '';
}

/**
 * Get category by link
 */
export function getCategoryByLink(categories: Category[], link?: string): Category | null {
  const normalizedLink = link?.replace(/^\/+|\/+$/g, '') ?? '';
  if (!normalizedLink || !categories?.length) return null;
  return findCategoryByLink(categories, normalizedLink);
}

/**
 * 获取分类的父分类（递归查找）
 */
export function getParentCategory(category: Category | null, categories: Category[]): Category | null {
  if (!categories?.length || !category) return null;

  for (const c of categories) {
    if (!c.children?.length) continue;

    // 直接检查当前层级
    if (c.children.some((child) => child.link === category.link)) {
      return c;
    }

    // 递归检查子分类
    for (const child of c.children) {
      if (child.children?.length) {
        const result = getParentCategory(category, [child]);
        if (result) return result;
      }
    }
  }
  return null;
}
