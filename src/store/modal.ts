/**
 * Unified Modal State Management
 *
 * Consolidates all modal/drawer/dialog state into a single store.
 * This replaces the scattered state in ui.ts for better state coordination.
 *
 * Features:
 * - Single active modal at a time (prevents stacking conflicts)
 * - Automatic body scroll lock
 * - Computed helpers for convenience
 * - Type-safe modal data
 */

import { atom, computed } from 'nanostores';

/**
 * Code fullscreen data
 */
export interface CodeBlockData {
  code: string;
  codeHTML: string;
  language: string;
  preClassName: string;
  preStyle: string;
  codeClassName: string;
}

/**
 * Unified diagram fullscreen data (mermaid + infographic)
 */
export interface DiagramFullscreenData {
  diagramType: 'mermaid' | 'infographic';
  svg: string;
  source: string;
}

// Local note: upstream also has an 'imageLightbox' modal here — we keep PhotoSwipe, so it is not ported.
export type ModalType = 'drawer' | 'search' | 'codeFullscreen' | 'diagramFullscreen' | 'settings' | null;

export interface ModalState {
  type: ModalType;
  data?: CodeBlockData | DiagramFullscreenData | null;
}

/**
 * Single source of truth for modal state
 */
const $activeModal = atom<ModalState>({ type: null });

// Computed helpers for convenience
export const $isDrawerOpen = computed($activeModal, (m) => m.type === 'drawer');
export const $isSearchOpen = computed($activeModal, (m) => m.type === 'search');
export const $codeFullscreenData = computed($activeModal, (m) =>
  m.type === 'codeFullscreen' ? (m.data as CodeBlockData) : null,
);
export const $diagramFullscreenData = computed($activeModal, (m) =>
  m.type === 'diagramFullscreen' ? (m.data as DiagramFullscreenData) : null,
);
export const $isAnyModalOpen = computed($activeModal, (m) => m.type !== null);
export const $isSettingsOpen = computed($activeModal, (m) => m.type === 'settings');

/**
 * Open a modal with optional data
 */
export function openModal<T extends ModalType>(
  type: T,
  data?: T extends 'codeFullscreen' ? CodeBlockData : T extends 'diagramFullscreen' ? DiagramFullscreenData : never,
): void {
  $activeModal.set({ type, data });
  // Settings stays non-modal, so switching from another modal must release its scroll lock.
  if (typeof document !== 'undefined') {
    document.body.style.overflow = type && type !== 'settings' ? 'hidden' : '';
  }
}

/**
 * Close the currently active modal
 */
export function closeModal(): void {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = '';
  }
  $activeModal.set({ type: null });
}

/**
 * Toggle a modal (open if closed, close if open)
 */
function toggleModal(type: ModalType): void {
  if ($activeModal.get().type === type) {
    closeModal();
  } else {
    openModal(type);
  }
}

// Convenience functions for specific modals
export const closeDrawer = () => closeModal();
export const toggleDrawer = () => toggleModal('drawer');
export const toggleSettings = () => toggleModal('settings');
