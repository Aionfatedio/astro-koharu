/**
 * useHeadingClickHandler Hook
 *
 * 处理 TOC 中标题点击的可复用 hook。
 * 滚动到对应标题并管理手风琴展开状态。
 *
 * @example
 * ```tsx
 * function TableOfContents() {
 *   const headings = useHeadingTree();
 *   const { expandedIds, setExpandedIds } = useExpandedState({ headings, activeId });
 *
 *   const handleHeadingClick = useHeadingClickHandler({
 *     headings,
 *     setExpandedIds,
 *   });
 *
 *   return <HeadingList onHeadingClick={handleHeadingClick} />;
 * }
 * ```
 */

import { lockHeadingTo } from '@lib/heading-scroll-lock';
import { useCallback } from 'react';
import { applyAccordion, findHeadingById, getParentIds, type Heading } from './useHeadingTree';

export interface UseHeadingClickHandlerOptions {
  /** 层级化的标题树 */
  headings: Heading[];
  /** 展开状态的 setter */
  setExpandedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}

/**
 * 处理标题点击，滚动到对应位置并更新手风琴展开状态
 *
 * @param options - 配置选项
 * @returns 标题点击处理函数
 *
 * Note: The `headings` dependency is intentional. The headings array comes from useState
 * in useHeadingTree, which provides a stable reference that only changes when the heading
 * structure actually changes (e.g., page navigation). This ensures the handler updates
 * when needed while avoiding unnecessary recreations during normal renders.
 */
export function useHeadingClickHandler({ headings, setExpandedIds }: UseHeadingClickHandlerOptions): (id: string) => void {
  return useCallback(
    (id: string) => {
      const element = document.getElementById(id);
      if (!element) return;

      lockHeadingTo(id);
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // 获取点击的标题节点
      const clickedHeading = findHeadingById(headings, id);
      if (!clickedHeading) return;

      // 收集需要展开的父级 ID
      const parentIds = getParentIds(clickedHeading);
      // 如果点击的标题本身有子节点，也将其加入展开列表
      if (clickedHeading.children.length > 0) {
        parentIds.unshift(id);
      }

      if (parentIds.length === 0) return;

      setExpandedIds((prev) => applyAccordion(prev, headings, parentIds));
    },
    [headings, setExpandedIds],
  );
}
