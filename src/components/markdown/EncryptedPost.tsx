/**
 * EncryptedPost - Full-page post encryption UI.
 *
 * Unlike EncryptedBlock (which renders decrypted HTML via dangerouslySetInnerHTML),
 * this component injects decrypted HTML directly into the DOM and dispatches
 * 'content:decrypted' to trigger ContentEnhancer re-scan, TOC rebuild, etc.
 *
 * Shares the locked-state UI, state machine and animations with EncryptedBlock
 * via DecryptForm + useDecryptFlow.
 */
import { useCallback, useEffect, useRef } from 'react';
import { DecryptForm } from './DecryptForm';
import { useDecryptFlow } from './useDecryptFlow';

interface EncryptedPostProps {
  element: HTMLElement;
}

export function EncryptedPost({ element }: EncryptedPostProps) {
  const decryptedRef = useRef('');
  const renderFrameRef = useRef<number | null>(null);

  const flow = useDecryptFlow({
    element,
    initialHint: '请输入密码以查看文章内容',
    onDecrypted: (plaintext) => {
      decryptedRef.current = plaintext;
    },
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
      if (!decryptedRef.current) return;

      element.innerHTML = decryptedRef.current;
      decryptedRef.current = '';
      element.classList.remove('encrypted-post');
      element.removeAttribute('data-cipher');
      element.removeAttribute('data-iv');
      element.removeAttribute('data-salt');
      element.removeAttribute('data-react-enhanced');

      const container = document.querySelector('.custom-content');
      if (container) container.removeAttribute('data-enhanced');
      document.dispatchEvent(new CustomEvent('content:decrypted'));
      setState('unlocked');
    });

    return () => {
      if (renderFrameRef.current !== null) {
        cancelAnimationFrame(renderFrameRef.current);
        renderFrameRef.current = null;
      }
    };
  }, [state, element, setState]);

  const startRendering = useCallback(() => setState('rendering'), [setState]);

  if (!flow.hasEncryptionData) {
    return <div className="encrypted-block-error">Error: Missing encryption data</div>;
  }

  if (state === 'unlocked') return null;

  return (
    <DecryptForm
      flow={flow}
      title="此文章已加密"
      className="encrypted-post-locked"
      iconLabel="内容已加密"
      buttonLabel="解锁"
      onSuccessAnimationComplete={startRendering}
    />
  );
}
