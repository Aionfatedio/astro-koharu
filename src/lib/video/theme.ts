/**
 * Get the active site theme color from CSS variables.
 */
export function getThemeColor(): string {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const primaryHsl = style.getPropertyValue('--primary').trim();

  if (!primaryHsl) {
    throw new Error('Missing CSS variable "--primary" for video player theme.');
  }

  return `hsl(${primaryHsl})`;
}
