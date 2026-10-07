import { useKeyboardShortcut } from '@hooks/useKeyboardShortcut';
import { useStore } from '@nanostores/react';
import { $activeModal, closeModal } from '@store/modal';
import { lazy, Suspense, useEffect, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

const viewers = {
  codeFullscreen: lazy(() => import('./CodeBlockFullscreen')),
  diagramFullscreen: lazy(() => import('./DiagramFullscreen')),
};
const viewerTypes = ['codeFullscreen', 'diagramFullscreen'] as const;

/** Keep opened viewers mounted for their exit animations; fetch each body only on first use. */
export default function ArticleViewers() {
  const { type } = useStore($activeModal);
  const [loaded, setLoaded] = useState({ codeFullscreen: false, diagramFullscreen: false });

  useEffect(() => {
    if (type === 'codeFullscreen' || type === 'diagramFullscreen') {
      setLoaded((previous) => (previous[type] ? previous : { ...previous, [type]: true }));
    }
  }, [type]);

  useKeyboardShortcut({
    key: 'Escape',
    handler: closeModal,
    enabled: type === 'codeFullscreen' || type === 'diagramFullscreen',
    ignoreInputs: false,
  });

  function notice(message: string, onClose: () => void) {
    return (
      <div className="fixed inset-x-4 bottom-4 z-60 flex items-center justify-between gap-4 rounded-xl bg-card p-4 shadow-lg">
        <output>{message}</output>
        <button type="button" className="min-h-11 rounded-lg px-4 hover:bg-muted" onClick={onClose}>
          关闭
        </button>
      </div>
    );
  }

  return (
    <>
      {viewerTypes.map((name) => {
        const Viewer = viewers[name];
        return (
          loaded[name] && (
            <ErrorBoundary
              key={name}
              fallbackRender={() =>
                type === name &&
                notice('查看器加载失败，请刷新页面重试。', () => {
                  setLoaded((previous) => ({ ...previous, [name]: false }));
                  if ($activeModal.get().type === name) closeModal();
                })
              }
            >
              <Suspense fallback={type === name ? notice('加载中...', closeModal) : null}>
                <Viewer />
              </Suspense>
            </ErrorBoundary>
          )
        );
      })}
    </>
  );
}
