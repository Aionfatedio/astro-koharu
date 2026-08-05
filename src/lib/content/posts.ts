/**
 * Post-related utility functions
 */

import { type CollectionEntry, getCollection, getEntry } from 'astro:content';

import summaries from '@assets/summaries.json';
import { siteConfig } from '@lib/config/site';
import type { FeaturedSeriesItem } from '@lib/config/types';
import readingTime from 'reading-time';
import type { BlogPost } from 'types/blog';
import { getPostSlug } from '../route';
import { extractTextFromMarkdown } from '../sanitize';
import { memoize } from './cache';
import { buildCategoryLink, buildCategoryPath, getCategoryPaths } from './category-path';
import { validateSummaryDataSlugs } from './generated-assets';

/** WeakMap-based cache for reading-time results — auto-GC when post objects are collected */
const readingTimeCache = new WeakMap<CollectionEntry<'blog'>, { words: number; text: string; minutes: number }>();

/**
 * Get reading-time stats for a post, cached per object identity.
 * Ensures each post's body is parsed at most once across transforms, Cover, and stats.
 */
export function getPostReadingTime(post: CollectionEntry<'blog'>): { words: number; text: string; minutes: number } {
  let cached = readingTimeCache.get(post);
  if (!cached) {
    const result = readingTime(post.body ?? '');
    cached = { words: result.words, text: result.text, minutes: result.minutes };
    readingTimeCache.set(post, cached);
  }
  return cached;
}

/** AI 摘要数据类型 */
type SummariesData = Record<string, { title: string; summary: string }>;

/**
 * 获取文章描述
 * 优先使用 frontmatter 中的 description，如果不存在则从 Markdown 内容中智能提取
 * @param post 文章对象
 * @param maxLength 最大长度，默认 150 字符
 * @returns 文章描述文本
 */
export function getPostDescription(post: BlogPost, maxLength: number = 150): string {
  if (post.data.password) return '本文已加密，请输入密码后查看。';
  return post.data.description || extractTextFromMarkdown(post.body ?? '', maxLength);
}

/**
 * 获取文章的 AI 摘要
 * @param slug 文章公开 slug（通常来自 post.data.link 或 post.id）
 * @returns AI 摘要文本，如果不存在则返回 null
 */
function getPostSummary(slug: string): string | null {
  const data = summaries as SummariesData;
  return data[slug]?.summary ?? null;
}

/**
 * 获取文章描述，带 AI 摘要 fallback
 * 优先级：frontmatter description > AI 摘要 > markdown 提取
 * @param post 文章对象
 * @param maxLength 最大长度，默认 150 字符
 * @returns 文章描述文本
 */
export function getPostDescriptionWithSummary(post: BlogPost, maxLength: number = 150): string {
  if (post.data.password) return '本文已加密，请输入密码后查看。';
  const slug = getPostSlug(post);
  return post.data.description || getPostSummary(slug) || extractTextFromMarkdown(post.body ?? '', maxLength);
}

export type PostSummarySource = 'description' | 'ai' | 'auto';

export interface ResolvedPostSummary {
  text: string;
  source: PostSummarySource;
}

/**
 * Resolve the article summary text and its source for page-level UI.
 */
export function resolvePostSummary(post: BlogPost, maxLength: number = 200): ResolvedPostSummary | null {
  if (post.data.password) return null;

  if (post.data.description) {
    return {
      text: post.data.description,
      source: 'description',
    };
  }

  const aiSummary = getPostSummary(getPostSlug(post));
  if (aiSummary) {
    return {
      text: aiSummary,
      source: 'ai',
    };
  }

  return {
    text: extractTextFromMarkdown(post.body ?? '', maxLength),
    source: 'auto',
  };
}

/**
 * Get all posts sorted by date (newest first)
 * In production, draft posts are filtered out
 */
export async function getSortedPosts(): Promise<CollectionEntry<'blog'>[]> {
  return memoize('sortedPosts', '__all__', async () => {
    const posts = await getCollection('blog', ({ data }) => {
      // 在生产环境中，过滤掉草稿
      return import.meta.env.PROD ? data.draft !== true : true;
    });

    // 使用浅拷贝避免原地修改 Astro 内部缓存的数组
    const sortedPosts = posts.toSorted((a: BlogPost, b: BlogPost) => {
      return b.data.date.getTime() - a.data.date.getTime();
    });

    validateSummaryDataSlugs(summaries as SummariesData, sortedPosts);

    return sortedPosts;
  });
}

/**
 * Get one post by its Content Layer ID.
 * Content Layer performs a direct entry lookup, avoiding a full collection
 * query/sort for every post page.
 */
export async function getPostById(id: string): Promise<CollectionEntry<'blog'> | undefined> {
  return getEntry('blog', id);
}

/**
 * Get post count (excluding drafts in production)
 */
export async function getPostCount() {
  const posts = await getSortedPosts();
  return posts.length;
}

/**
 * Get posts under a category path. Descendant category paths are included.
 * @param categoryPath Full category name path
 * @returns 文章列表
 */
export async function getPostsByCategoryPath(categoryPath: string[]): Promise<BlogPost[]> {
  const key = buildCategoryLink(categoryPath);
  return memoize('postsByCatPath', key, async () => {
    const posts = await getSortedPosts();
    return posts.filter((post) => isPostInCategoryPath(post, categoryPath));
  });
}

/**
 * Get posts whose configured category path contains a category name.
 * This exists for legacy featuredSeries.categoryName configuration.
 */
export async function getPostsByCategoryName(categoryName: string): Promise<BlogPost[]> {
  return memoize('postsByCatName', categoryName, async () => {
    const posts = await getSortedPosts();
    return posts.filter((post) => isPostInCategoryName(post, categoryName));
  });
}

/**
 * Get the last (deepest) category of a post
 */
export function getPostLastCategory(post: BlogPost): { link: string; name: string } {
  const [firstCategoryPath] = getCategoryPaths(post.data.categories);
  if (!firstCategoryPath?.length) return { link: '', name: '' };

  return {
    link: buildCategoryPath(firstCategoryPath),
    name: firstCategoryPath[firstCategoryPath.length - 1],
  };
}

/**
 * 获取文章所属系列的所有文章（基于最深层分类）
 * @param post 当前文章
 * @returns 系列文章列表（按日期排序，最新的在前）
 */
export async function getSeriesPosts(post: BlogPost): Promise<BlogPost[]> {
  const [firstCategoryPath] = getCategoryPaths(post.data.categories);
  if (!firstCategoryPath?.length) return [];

  return getPostsByCategoryPath(firstCategoryPath);
}

/**
 * 获取文章的上一篇和下一篇（在同一系列中）
 * @param currentPost 当前文章
 * @returns 上一篇和下一篇文章
 */
export async function getAdjacentSeriesPosts(currentPost: BlogPost): Promise<{
  prevPost: BlogPost | null;
  nextPost: BlogPost | null;
}> {
  const seriesPosts = await getSeriesPosts(currentPost);

  if (seriesPosts.length === 0) {
    return { prevPost: null, nextPost: null };
  }

  const currentIndex = seriesPosts.findIndex((post) => post.id === currentPost.id);

  if (currentIndex === -1) {
    return { prevPost: null, nextPost: null };
  }

  // 因为文章是按日期降序排列的（最新的在前）
  // prevPost 是更新的文章（索引 - 1）
  // nextPost 是更旧的文章（索引 + 1）
  const prevPost = currentIndex > 0 ? seriesPosts[currentIndex - 1] : null;
  const nextPost = currentIndex < seriesPosts.length - 1 ? seriesPosts[currentIndex + 1] : null;

  return { prevPost, nextPost };
}

/**
 * 检查文章是否属于特定分类
 * @param post 文章
 * @param categoryName 分类名
 * @returns 是否属于该分类
 */
function isPathPrefix(path: string[], prefix: string[]): boolean {
  if (prefix.length > path.length) return false;
  return prefix.every((name, index) => path[index] === name);
}

function isPostInCategoryPath(post: BlogPost, categoryPath: string[]): boolean {
  return getCategoryPaths(post.data.categories).some((postCategoryPath) => isPathPrefix(postCategoryPath, categoryPath));
}

function isPostInCategoryName(post: BlogPost, categoryName: string): boolean {
  return getCategoryPaths(post.data.categories).some((categoryPath) => categoryPath.includes(categoryName));
}

// =============================================================================
// Featured Series Functions
// =============================================================================

/**
 * 获取所有启用的 Featured Series
 * @returns 启用的系列列表
 */
export function getEnabledSeries(): FeaturedSeriesItem[] {
  return siteConfig.featuredSeries.filter((series) => series.enabled !== false);
}

/**
 * 获取所有 Featured Series 的分类名
 * @returns 分类名列表
 */
function getFeaturedCategoryNames(): Set<string> {
  return new Set(getEnabledSeries().map((series) => series.categoryName));
}

function getPostCategoryNames(post: BlogPost): Set<string> {
  return new Set(getCategoryPaths(post.data.categories).flat());
}

function hasAnyCategoryName(postCategoryNames: Set<string>, categoryNames: Set<string>): boolean {
  for (const categoryName of categoryNames) {
    if (postCategoryNames.has(categoryName)) return true;
  }
  return false;
}

/**
 * 获取所有非 Featured Series 的文章（已排序）
 * @returns 非系列文章列表（按日期排序，最新的在前）
 */
export async function getNonFeaturedPosts(): Promise<BlogPost[]> {
  const categoryNames = getFeaturedCategoryNames();
  if (categoryNames.size === 0) {
    return getSortedPosts();
  }

  const allPosts = await getSortedPosts();
  return allPosts.filter((post) => !hasAnyCategoryName(getPostCategoryNames(post), categoryNames));
}

/**
 * 优化的首页数据获取 - 单次遍历获取所有需要的数据
 * @returns 包含高亮文章、置顶文章和普通文章的对象
 */
export async function getHomePagePosts(): Promise<{
  highlightedPosts: BlogPost[];
  stickyPosts: BlogPost[];
  regularPosts: BlogPost[];
}> {
  const allPosts = await getSortedPosts();
  const highlightedSeries = getEnabledSeries().filter((series) => series.highlightOnHome !== false);
  const categoryNames = getFeaturedCategoryNames();

  // 用于追踪每个高亮系列的最新文章
  const seriesLatestMap = new Map<string, BlogPost>();

  const stickyPosts: BlogPost[] = [];
  const regularPosts: BlogPost[] = [];

  // 单次遍历所有文章
  for (const post of allPosts) {
    const postCategoryNames = getPostCategoryNames(post);
    // 检查是否属于任何 featured 系列
    const isFeatured = hasAnyCategoryName(postCategoryNames, categoryNames);

    if (isFeatured) {
      // 检查是否属于高亮系列，并记录最新文章
      for (const series of highlightedSeries) {
        if (postCategoryNames.has(series.categoryName)) {
          if (!seriesLatestMap.has(series.categoryName)) {
            seriesLatestMap.set(series.categoryName, post);
          }
          break;
        }
      }
      // 跳过所有 featured 系列文章，不加入普通列表
      continue;
    }

    if (post.data.sticky) {
      stickyPosts.push(post);
    } else {
      regularPosts.push(post);
    }
  }

  // 提取高亮文章（保持系列定义的顺序）
  const highlightedPosts: BlogPost[] = [];
  for (const series of highlightedSeries) {
    const post = seriesLatestMap.get(series.categoryName);
    if (post) {
      highlightedPosts.push(post);
    }
  }

  return { highlightedPosts, stickyPosts, regularPosts };
}
