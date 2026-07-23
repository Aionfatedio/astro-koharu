/**
 * FloatingGroup Component
 *
 * Floating action buttons for navigation and utilities.
 * - Scroll to top/bottom
 * - Christmas effects toggle
 * - Expand/collapse toggle
 */

import { LazyMotionProvider } from '@components/common/LazyMotionProvider';
import { preloadSettingsPanel } from '@components/settings/SettingsPanel';
import { bgmConfig, christmasConfig } from '@constants/site-config';
import { useIsMounted } from '@hooks/useIsMounted';
import { Icon } from '@iconify/react';
import { cn } from '@lib/utils';
import { useStore } from '@nanostores/react';
import { $bgmPanelOpen, toggleBgmPanel } from '@store/bgm';
import { christmasEnabled, disableChristmasCompletely, enableChristmas, initChristmasState } from '@store/christmas';
import { $isDrawerOpen, $isSettingsOpen, toggleSettings } from '@store/modal';
import { bgmWidgetEnabled, initSettings } from '@store/settings';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useState } from 'react';

const FLOATING_GROUP_EXPANDED_KEY = 'floating-group-expanded';

interface FloatingButtonProps {
  onClick: () => void;
  ariaLabel: string;
  title: string;
  children: React.ReactNode;
  className?: string;
  onIntent?: () => void;
  /** Optional data attribute for identifying BGM toggle button */
  dataBgmToggle?: boolean;
  /** Optional data attribute for identifying settings toggle button */
  dataSettingsToggle?: boolean;
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToBottom() {
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
}

function toggleChristmas() {
  if (christmasEnabled.get()) {
    disableChristmasCompletely();
  } else {
    enableChristmas();
  }
}

function FloatingButton({
  onClick,
  ariaLabel,
  title,
  children,
  className,
  onIntent,
  dataBgmToggle,
  dataSettingsToggle,
}: FloatingButtonProps) {
  const isMounted = useIsMounted();

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={onIntent}
      onPointerDown={onIntent}
      onFocus={onIntent}
      className={cn(
        'rounded-full bg-background/80 p-2 opacity-80 shadow-lg backdrop-blur-sm transition-all duration-200 hover:bg-background hover:opacity-100',
        className,
      )}
      aria-label={ariaLabel}
      title={isMounted ? title : undefined}
      data-bgm-toggle={dataBgmToggle || undefined}
      data-settings-toggle={dataSettingsToggle || undefined}
    >
      {children}
    </button>
  );
}

export default function FloatingGroup() {
  // Local mod: persist expand state across visits (default collapsed).
  const [isExpanded, setIsExpanded] = useState(() => localStorage.getItem(FLOATING_GROUP_EXPANDED_KEY) === 'true');
  const isDrawerOpen = useStore($isDrawerOpen);
  const isChristmasEnabled = useStore(christmasEnabled);
  const isBgmPanelOpen = useStore($bgmPanelOpen);
  const isSettingsOpen = useStore($isSettingsOpen);
  const isBgmWidgetEnabled = useStore(bgmWidgetEnabled);

  // Initialize christmas & settings state on mount
  useEffect(() => {
    initChristmasState();
    initSettings();
  }, []);

  const toggleExpand = () => {
    setIsExpanded((prev) => {
      const next = !prev;
      localStorage.setItem(FLOATING_GROUP_EXPANDED_KEY, String(next));
      return next;
    });
  };

  // Hide when drawer is open
  const isHidden = isDrawerOpen;

  return (
    <LazyMotionProvider>
      <m.div
        className="fixed right-4 bottom-4 z-50 flex flex-col gap-2 text-primary"
        animate={{
          x: isHidden ? 200 : 0,
          opacity: isHidden ? 0 : 1,
          pointerEvents: isHidden ? 'none' : 'auto',
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
      >
        <AnimatePresence>
          {isExpanded && (
            <m.div
              className="flex flex-col gap-2"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeInOut' }}
            >
              {christmasConfig.enabled && (
                <FloatingButton onClick={toggleChristmas} ariaLabel="切换圣诞特效" title="切换圣诞特效">
                  <Icon icon={isChristmasEnabled ? 'ri:snowy-fill' : 'ri:snowy-line'} className="h-5 w-5" />
                </FloatingButton>
              )}
              {bgmConfig.enabled && bgmConfig.audio.length > 0 && isBgmWidgetEnabled && (
                <FloatingButton onClick={toggleBgmPanel} ariaLabel="背景音乐" title="背景音乐" dataBgmToggle>
                  <Icon icon={isBgmPanelOpen ? 'ri:music-2-fill' : 'ri:music-2-line'} className="h-5 w-5" />
                </FloatingButton>
              )}
              <FloatingButton
                onClick={toggleSettings}
                onIntent={preloadSettingsPanel}
                ariaLabel="设置"
                title="设置"
                dataSettingsToggle
              >
                <Icon icon={isSettingsOpen ? 'ri:settings-3-fill' : 'ri:settings-3-line'} className="h-5 w-5" />
              </FloatingButton>
              <FloatingButton onClick={scrollToTop} ariaLabel="回到顶部" title="回到顶部">
                <Icon icon="ri:arrow-up-s-line" className="h-5 w-5" />
              </FloatingButton>
              <FloatingButton onClick={scrollToBottom} ariaLabel="滚到底部" title="滚到底部">
                <Icon icon="ri:arrow-down-s-line" className="h-5 w-5" />
              </FloatingButton>
            </m.div>
          )}
        </AnimatePresence>

        <FloatingButton
          onClick={toggleExpand}
          ariaLabel="展开/收起工具栏"
          title="展开/收起工具栏"
          className="size-9 flex-center"
        >
          <Icon icon={isExpanded ? 'ri:close-large-fill' : 'ri:magic-fill'} className="size-4" />
        </FloatingButton>
      </m.div>
    </LazyMotionProvider>
  );
}
