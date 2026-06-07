import { decryptContent } from '@lib/crypto/decrypt';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

export type DecryptPhase = 'locked' | 'decrypting' | 'success' | 'rendering' | 'rendered' | 'unlocked' | 'error';

interface UseDecryptFlowOptions {
  /** The encrypted element carrying data-cipher / data-iv / data-salt. */
  element: HTMLElement;
  /** Hint shown while locked and restored after a wrong password. */
  initialHint: string;
  /** Receives the plaintext the instant decryption succeeds (before the success animation). */
  onDecrypted: (plaintext: string) => void;
}

export interface DecryptFlow {
  state: DecryptPhase;
  setState: React.Dispatch<React.SetStateAction<DecryptPhase>>;
  expanded: boolean;
  hintText: string;
  hintFaded: boolean;
  busy: boolean;
  hasEncryptionData: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleBtnClick: () => void;
}

/**
 * Shared decryption form state machine for EncryptedBlock and EncryptedPost.
 *
 * Manages the input expand animation, password submission, the wrong-password
 * hint crossfade/shake timing, and timer cleanup. The consumer supplies
 * `onDecrypted` to capture the plaintext and then drives the post-success
 * rendering itself (which differs: inline HTML vs. direct DOM injection) by
 * advancing `state` through 'rendering' → … → 'unlocked'.
 */
export function useDecryptFlow({ element, initialHint, onDecrypted }: UseDecryptFlowOptions): DecryptFlow {
  const [state, setState] = useState<DecryptPhase>('locked');
  const [expanded, setExpanded] = useState(false);
  const [hintFaded, setHintFaded] = useState(false);
  const [hintText, setHintText] = useState(initialHint);
  const inputRef = useRef<HTMLInputElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      for (const t of timersRef.current) clearTimeout(t);
    };
  }, []);

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
      onDecrypted(result);
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
        setHintText(initialHint);
        setHintFaded(false);
        setState('locked');
      }, 1240);
    }
  }, [element, schedule, initialHint, onDecrypted]);

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

  const hasEncryptionData = Boolean(element.dataset.cipher && element.dataset.iv && element.dataset.salt);

  return {
    state,
    setState,
    expanded,
    hintText,
    hintFaded,
    busy,
    hasEncryptionData,
    inputRef,
    handleKeyDown,
    handleBtnClick,
  };
}
