import { Icon } from '@iconify/react';
import { decryptContent } from '@lib/crypto/decrypt';
import { cn } from '@lib/utils';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

interface EncryptedBlockProps {
  element: HTMLElement;
}

type DecryptState = 'locked' | 'decrypting' | 'success' | 'rendering' | 'rendered' | 'unlocked' | 'error';

function LoadingSpinner() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" role="img" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2A10 10 0 1 0 22 12A10 10 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8A8 8 0 0 1 12 20Z"
        opacity="0.5"
      />
      <path fill="currentColor" d="M20 12h2A10 10 0 0 0 12 2V4A8 8 0 0 1 20 12Z">
        <animateTransform
          attributeName="transform"
          dur="1s"
          from="0 12 12"
          repeatCount="indefinite"
          to="360 12 12"
          type="rotate"
        />
      </path>
    </svg>
  );
}

function SuccessCheck({ onComplete }: { onComplete: () => void }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="32"
      height="32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-hidden="true"
    >
      <g fill="none">
        <path className="encrypted-check-path" d="M4.5 13.5l4 4l10.75 -10.75" onAnimationEnd={onComplete} />
      </g>
    </svg>
  );
}

export function EncryptedBlock({ element }: EncryptedBlockProps) {
  const [state, setState] = useState<DecryptState>('locked');
  const [html, setHtml] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [hintFaded, setHintFaded] = useState(false);
  const [hintText, setHintText] = useState('此内容已加密，请输入密码查看');
  const inputRef = useRef<HTMLInputElement>(null);
  const renderFrameRef = useRef<number | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const startHeightRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (renderFrameRef.current !== null) cancelAnimationFrame(renderFrameRef.current);
      for (const t of timersRef.current) clearTimeout(t);
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
  }, [state]);

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
  }, [state, element]);

  const startRendering = useCallback(() => {
    startHeightRef.current = element.offsetHeight;
    setState('rendering');
  }, [element]);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  const handleDecrypt = useCallback(async () => {
    const password = inputRef.current?.value;
    if (!password) return;

    const { cipher, iv, salt } = element.dataset;
    if (!cipher || !iv || !salt) return;

    setState('decrypting');
    const result = await decryptContent(cipher, iv, salt, password);

    if (result) {
      setHtml(result);
      setState('success');
    } else {
      setState('error');

      setHintFaded(true);
      schedule(() => {
        setHintText('密码错误');
        setHintFaded(false);
      }, 120);
      schedule(() => setHintFaded(true), 1120);
      schedule(() => {
        setHintText('此内容已加密，请输入密码查看');
        setHintFaded(false);
        setState('locked');
      }, 1240);
    }
  }, [element, schedule]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleDecrypt();
    },
    [handleDecrypt],
  );

  const handleBtnClick = useCallback(() => {
    if (!expanded) {
      setExpanded(true);
      schedule(() => inputRef.current?.focus(), 350);
      return;
    }
    handleDecrypt();
  }, [expanded, handleDecrypt, schedule]);

  const busy =
    state === 'decrypting' || state === 'error' || state === 'success' || state === 'rendering' || state === 'rendered';

  if (!element.dataset.cipher || !element.dataset.iv || !element.dataset.salt) {
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
    <div className={cn('encrypted-block-locked', (state === 'success' || state === 'rendering') && 'encrypted-block-success')}>
      <Icon
        icon="ri:lock-2-line"
        className={cn('encrypted-block-icon', state === 'error' && 'encrypted-block-icon-error')}
        aria-label="Locked content"
      />
      <p
        className={cn(
          'encrypted-block-hint',
          (hintFaded || state === 'success' || state === 'rendering') && 'encrypted-hint-faded',
          state === 'error' && 'encrypted-hint-error',
        )}
      >
        {hintText}
      </p>
      <div
        className={cn(
          'encrypted-block-input-group',
          !expanded && 'encrypted-input-collapsed',
          state === 'error' && 'encrypted-shake',
        )}
      >
        <input
          ref={inputRef}
          type="password"
          className="encrypted-block-input"
          placeholder="输入密码..."
          autoComplete="off"
          onKeyDown={handleKeyDown}
          disabled={busy}
          tabIndex={expanded ? 0 : -1}
        />
        <button type="button" className="encrypted-block-btn" onClick={handleBtnClick} disabled={busy} aria-label="Unlock">
          {state === 'decrypting' ? (
            <Icon icon="ri:loader-4-line" className="animate-spin" />
          ) : (
            <Icon icon="ri:lock-unlock-line" />
          )}
        </button>
      </div>
      {(state === 'success' || state === 'rendering') && (
        <div className="encrypted-success-overlay">
          {state === 'rendering' ? <LoadingSpinner /> : <SuccessCheck onComplete={startRendering} />}
        </div>
      )}
    </div>
  );
}
