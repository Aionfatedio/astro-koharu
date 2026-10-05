/**
 * SeriesPostList - 显示系列文章列表
 */

import { Routes } from '@constants/router';
import { routeBuilder } from '@lib/route';
import { cn } from '@lib/utils';
import type { PostRef } from '@/types/blog';

interface SeriesPostListProps {
  posts: PostRef[];
  currentPostSlug?: string;
  className?: string;
}

export function SeriesPostList({ posts, currentPostSlug, className }: SeriesPostListProps) {
  if (!posts?.length) {
    return <div className="py-8 text-center text-muted-foreground text-sm">暂无系列文章</div>;
  }

  return (
    <div className={cn('series-thread', className)} data-series-list>
      {posts.map((post) => {
        const href = routeBuilder(Routes.Post, post);
        const isActive = post.slug === currentPostSlug;

        return (
          <a key={post.slug} href={href} className="series-thread-item" aria-current={isActive ? 'page' : undefined}>
            <span className="series-thread-bead" aria-hidden="true" />
            <span className="series-thread-title">{post.title}</span>
          </a>
        );
      })}
    </div>
  );
}
