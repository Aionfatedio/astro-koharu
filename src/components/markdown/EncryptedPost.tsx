/**
 * EncryptedPost - Full-page post encryption UI.
 *
 * Unlike EncryptedBlock (which renders decrypted HTML via dangerouslySetInnerHTML),
 * this component injects decrypted HTML directly into the DOM and dispatches
 * 'content:decrypted' to trigger ContentEnhancer re-scan, TOC rebuild, etc.
 *
 * Uses the same custom styles and animations as EncryptedBlock:
 * - Input expand animation (collapsed → expanded)
 * - Hint text crossfade (locked → error → locked)
 * - Success spinner → checkmark animation
 * - Shake animation on wrong password
 */
import { Icon } from '@iconify/react';
import { decryptContent } from '@lib/crypto/decrypt';
import { cn } from '@lib/utils';
import { useCallback, useEffect, useRef, useState } from 'react';

interface EncryptedPostProps {
  element: HTMLElement;
}

type DecryptState = 'locked' | 'decrypting' | 'unlocked' | 'error' | 'success';

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

function SuccessCheck() {
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
      <g fill="none" strokeDasharray="24" strokeDashoffset="24">
        <path d="M4.5 13.5l4 4l10.75 -10.75">
          <animate fill="freeze" attributeName="stroke-dashoffset" dur="0.4s" values="24;0" />
        </path>
      </g>
    </svg>
  );
}

export function EncryptedPost({ element }: EncryptedPostProps) {
  const [state, setState] = useState<DecryptState>('locked');
  const [expanded, setExpanded] = useState(false);
  const [hintFaded, setHintFaded] = useState(false);
  const [hintText, setHintText] = useState('此文章已加密，请输入密码查看');
  const [showCheck, setShowCheck] = useState(false);
  const decryptedRef = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      for (const t of timersRef.current) clearTimeout(t);
    };
  }, []);

  // Inject decrypted HTML after success animation completes
  useEffect(() => {
    if (state !== 'unlocked' || !decryptedRef.current) return;

    element.innerHTML = decryptedRef.current;
    decryptedRef.current = '';
    element.classList.remove('encrypted-post');
    element.removeAttribute('data-cipher');
    element.removeAttribute('data-iv');
    element.removeAttribute('data-salt');
    element.removeAttribute('data-react-enhanced');

    requestAnimationFrame(() => {
      const container = document.querySelector('.custom-content');
      if (container) container.removeAttribute('data-enhanced');
      document.dispatchEvent(new CustomEvent('content:decrypted'));
    });
  }, [state, element]);

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
      decryptedRef.current = result;
      setState('success');
      setShowCheck(false);
      // Phase 1: spinner → checkmark
      schedule(() => setShowCheck(true), 400);
      // Phase 2: inject HTML into DOM
      schedule(() => setState('unlocked'), 800);
    } else {
      setState('error');

      setHintFaded(true);
      schedule(() => {
        setHintText('密码错误');
        setHintFaded(false);
      }, 120);
      schedule(() => setHintFaded(true), 1120);
      schedule(() => {
        setHintText('此文章已加密，请输入密码查看');
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

  const busy = state === 'decrypting' || state === 'error' || state === 'success';

  if (!element.dataset.cipher || !element.dataset.iv || !element.dataset.salt) {
    return <div className="encrypted-block-error">Error: Missing encryption data</div>;
  }

  // After unlock, the useEffect injects HTML — component renders nothing
  if (state === 'unlocked') return null;

  return (
    <div className={cn('encrypted-block-locked encrypted-post-locked', state === 'success' && 'encrypted-block-success')}>
      <Icon
        icon="ri:lock-2-line"
        className={cn('encrypted-block-icon', state === 'error' && 'encrypted-block-icon-error')}
        aria-label="内容已加密"
      />
      <p className="encrypted-post-title">此文章已加密</p>
      <p
        className={cn(
          'encrypted-block-hint',
          (hintFaded || state === 'success') && 'encrypted-hint-faded',
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
        <button type="button" className="encrypted-block-btn" onClick={handleBtnClick} disabled={busy} aria-label="解锁">
          {state === 'decrypting' ? (
            <Icon icon="ri:loader-4-line" className="animate-spin" />
          ) : (
            <Icon icon="ri:lock-unlock-line" />
          )}
        </button>
      </div>
      {state === 'success' && (
        <div className="encrypted-success-overlay">{showCheck ? <LoadingSpinner /> : <SuccessCheck />}</div>
      )}
    </div>
  );
}
