import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { editorConfig, postActionsConfig } from '@lib/config/site';
import { getSortedPosts } from '@lib/content';
import { isPostSourceEnabled, isPostSourcePublic } from '@lib/content/post-source';
import { getPostSlug } from '@lib/route';
import type { APIRoute } from 'astro';

export async function getStaticPaths() {
  if (!isPostSourceEnabled(postActionsConfig, editorConfig.enabled, import.meta.env.DEV)) return [];
  const posts = await getSortedPosts();
  return posts.flatMap((post) =>
    post.filePath && isPostSourcePublic(post.data, post.body, import.meta.env.PROD)
      ? [{ params: { slug: getPostSlug(post) }, props: { filePath: post.filePath } }]
      : [],
  );
}

/** Serves the post's original Markdown file, frontmatter included. */
export const GET: APIRoute<{ filePath: string }> = async ({ props }) => {
  const source = await readFile(resolve(props.filePath));
  return new Response(source, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
