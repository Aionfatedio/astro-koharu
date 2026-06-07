import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DecryptForm, LoadingSpinner } from './DecryptForm';
import { useDecryptFlow } from './useDecryptFlow';

interface EncryptedBlockProps {
  element: HTMLElement;
}

/**
 * Inline encrypted block. Renders decrypted HTML via dangerouslySetInnerHTML
 * with a smooth height transition, then triggers content enhancers.
 */
export function EncryptedBlock({ element }: EncryptedBlockProps) {
  const [html, setHtml] = useState('');
  const renderFrameRef = useRef<number | null>(null);
  const startHeightRef = useRef<number | null>(null);

  const flow = useDecryptFlow({
    element,
    initialHint: '此内容已加密，请输入密码查看',
    onDecrypted: setHtml,
  });
  const { state, setState } = flow;

  useEffect(() => {
    return () => {
      if (renderFrameRef.current !== null) cancelAnimationFrame(renderFrameRef.current);
    };
  }, []);

  useEffect(() => {
    if (state !== 'rendering') return;

    renderFrameRef.current = requestAnimationFrame(() => {
      renderFrameRef.current = null;
      setState('rendered');
    });

    return () => {
      if (renderFrameRef.current !== null) {
        cancelAnimationFrame(renderFrameRef.current);
        renderFrameRef.current = null;
      }
    };
  }, [state, setState]);

  // After unlocked content is rendered, trigger content enhancers (images, videos, etc.)
  useEffect(() => {
    if (state !== 'unlocked') return;

    requestAnimationFrame(() => {
      const container = document.querySelector('.custom-content');
      if (container) container.removeAttribute('data-enhanced');
      document.dispatchEvent(new CustomEvent('content:decrypted'));
    });
  }, [state]);

  // Smooth height transition after decrypted content is committed.
  useLayoutEffect(() => {
    if (state !== 'rendered' || startHeightRef.current === null) return;

    const startHeight = startHeightRef.current;
    startHeightRef.current = null;

    const endHeight = element.offsetHeight;

    // Lock to old height (user never sees the natural height)
    element.style.height = `${startHeight}px`;
    element.style.overflow = 'hidden';

    if (startHeight === endHeight) {
      element.style.height = '';
      element.style.overflow = '';
      setState('unlocked');
      return;
    }

    requestAnimationFrame(() => {
      element.style.transition = 'height 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
      element.style.height = `${endHeight}px`;

      const cleanup = (event: TransitionEvent) => {
        if (event.target !== element || event.propertyName !== 'height') return;
        element.style.height = '';
        element.style.overflow = '';
        element.style.transition = '';
        element.removeEventListener('transitionend', cleanup);
      };
      element.addEventListener('transitionend', cleanup);
    });

    setState('unlocked');
  }, [state, element, setState]);

  const startRendering = useCallback(() => {
    startHeightRef.current = element.offsetHeight;
    setState('rendering');
  }, [element, setState]);

  if (!flow.hasEncryptionData) {
    return <div className="encrypted-block-error">Error: Missing encryption data</div>;
  }

  if (state === 'rendered' || state === 'unlocked') {
    return (
      <div className="encrypted-block-render-frame">
        <div className="encrypted-block-content encrypted-content-enter prose dark:prose-invert max-w-none">
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: content is from our own build-time markdown pipeline */}
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
        {state === 'rendered' && (
          <div className="encrypted-success-overlay">
            <LoadingSpinner />
          </div>
        )}
      </div>
    );
  }

  return (
    <DecryptForm flow={flow} iconLabel="Locked content" buttonLabel="Unlock" onSuccessAnimationComplete={startRendering} />
  );
}
