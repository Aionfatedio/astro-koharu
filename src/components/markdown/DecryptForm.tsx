import { Icon } from '@iconify/react';
import { cn } from '@lib/utils';
import type { DecryptFlow } from './useDecryptFlow';

/** Rotating ring spinner shown while decrypted content is being committed. */
export function LoadingSpinner() {
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

/** Animated success checkmark; fires onComplete when its stroke animation ends. */
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

interface DecryptFormProps {
  flow: DecryptFlow;
  /** Optional title above the hint (EncryptedPost shows "此文章已加密"). */
  title?: string;
  /** Extra class on the locked wrapper (e.g. 'encrypted-post-locked'). */
  className?: string;
  /** aria-label for the lock icon. */
  iconLabel: string;
  /** aria-label for the unlock button. */
  buttonLabel: string;
  /** Called when the success checkmark animation finishes (consumer starts rendering). */
  onSuccessAnimationComplete: () => void;
}

/** Locked-state decryption UI: lock icon, hint, password input + unlock button, success overlay. */
export function DecryptForm({ flow, title, className, iconLabel, buttonLabel, onSuccessAnimationComplete }: DecryptFormProps) {
  const { state, expanded, hintText, hintFaded, busy, inputRef, handleKeyDown, handleBtnClick } = flow;
  const settling = state === 'success' || state === 'rendering';

  return (
    <div className={cn('encrypted-block-locked', settling && 'encrypted-block-success', className)}>
      <Icon
        icon="ri:lock-2-line"
        className={cn('encrypted-block-icon', state === 'error' && 'encrypted-block-icon-error')}
        aria-label={iconLabel}
      />
      {title && <p className="encrypted-post-title">{title}</p>}
      <p
        className={cn(
          'encrypted-block-hint',
          (hintFaded || settling) && 'encrypted-hint-faded',
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
        <button type="button" className="encrypted-block-btn" onClick={handleBtnClick} disabled={busy} aria-label={buttonLabel}>
          {state === 'decrypting' ? (
            <Icon icon="ri:loader-4-line" className="animate-spin" />
          ) : (
            <Icon icon="ri:lock-unlock-line" />
          )}
        </button>
      </div>
      {settling && (
        <div className="encrypted-success-overlay">
          {state === 'rendering' ? <LoadingSpinner /> : <SuccessCheck onComplete={onSuccessAnimationComplete} />}
        </div>
      )}
    </div>
  );
}
