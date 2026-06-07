import type { BlogPost } from '@/types/blog';
import { getPostSlug } from '../route';

type SummaryData = Record<string, { title: string; summary: string }>;

type SimilarPost = {
  slug: string;
  title: string;
  similarity: number;
};

type SimilarityData = Record<string, SimilarPost[]>;

function getCanonicalSlugSet(posts: BlogPost[]): Set<string> {
  return new Set(posts.map((post) => getPostSlug(post)));
}

function assertKnownSlug(slug: string, knownSlugs: Set<string>, assetName: string): void {
  if (!knownSlugs.has(slug)) {
    throw new Error(`${assetName} references unknown post slug "${slug}". Regenerate or update the generated asset file.`);
  }
}

export function validateSummaryDataSlugs(data: SummaryData, posts: BlogPost[]): void {
  const knownSlugs = getCanonicalSlugSet(posts);

  for (const [slug, summary] of Object.entries(data)) {
    assertKnownSlug(slug, knownSlugs, 'summaries.json');
    if (!summary.title || !summary.summary) {
      throw new Error(`summaries.json entry "${slug}" must include non-empty title and summary fields.`);
    }
  }
}

export function validateSimilarityDataSlugs(data: SimilarityData, posts: BlogPost[]): void {
  const knownSlugs = getCanonicalSlugSet(posts);

  for (const [slug, relatedPosts] of Object.entries(data)) {
    assertKnownSlug(slug, knownSlugs, 'similarities.json');
    if (!Array.isArray(relatedPosts)) {
      throw new Error(`similarities.json entry "${slug}" must be an array.`);
    }

    for (const relatedPost of relatedPosts) {
      assertKnownSlug(relatedPost.slug, knownSlugs, 'similarities.json');
      if (relatedPost.slug === slug) {
        throw new Error(`similarities.json entry "${slug}" must not reference itself.`);
      }
      if (!Number.isFinite(relatedPost.similarity) || relatedPost.similarity < 0 || relatedPost.similarity > 1) {
        throw new Error(`similarities.json entry "${slug}" has invalid similarity for "${relatedPost.slug}".`);
      }
    }
  }
}
