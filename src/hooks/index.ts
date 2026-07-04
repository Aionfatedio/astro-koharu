/**
 * Custom Hooks Barrel Export
 *
 * Centralized export for all custom React hooks.
 * Import hooks from '@hooks' for convenience.
 */

export { type UseActiveHeadingOptions, useActiveHeading } from './useActiveHeading';

// Controlled/uncontrolled state pattern
export type { UseControlledStateOptions } from './useControlledState';
export type { CurrentHeading, UseCurrentHeadingOptions } from './useCurrentHeading';
export { type UseExpandedStateOptions, type UseExpandedStateReturn, useExpandedState } from './useExpandedState';
// Floating UI wrapper
export type { UseFloatingUIOptions } from './useFloatingUI';
export { type UseHeadingClickHandlerOptions, useHeadingClickHandler } from './useHeadingClickHandler';
// TableOfContents-specific hooks
export { type Heading, useHeadingTree } from './useHeadingTree';
// Theme state hook (monitors actual page theme, not system preference)
export { useIsDarkTheme } from './useIsDarkTheme';
// Keyboard shortcuts
export type { KeyboardShortcutOptions, ModifierKey } from './useKeyboardShortcut';
// Media query hooks
export { useMediaQuery, usePrefersReducedMotion } from './useMediaQuery';
// Scroll state hooks
export type { ScrollTriggerState, UseScrollTriggerOptions } from './useScrollTrigger';
// Zoom and pan for fullscreen viewers
export type { UseZoomPanReturn } from './useZoomPan';
