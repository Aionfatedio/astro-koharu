/**
 * Remark plugin for inline Iconify icons in Markdown.
 *
 * Syntax:
 *   %prefix/icon-name%                        → 24px, currentColor (Iconify icon)
 *   %prefix/icon-name 20px%                   → 20px, currentColor
 *   %prefix/icon-name red%                    → 24px, red
 *   %prefix/icon-name 20px red%               → 20px, red
 *   %/path/to/icon.svg%                       → 24px, currentColor (custom SVG from public/)
 *   %/path/to/icon.svg 32px blue%             → 32px, blue
 *
 * Resolves icons from @iconify-json/* packages or custom SVG files
 * at build time, emitting inline <svg> elements with zero runtime cost.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { PhrasingContent, Root } from 'mdast';
import { visit } from 'unist-util-visit';
import { escapeHtml } from './shoka-renderers';

// ESM-compatible require for loading @iconify-json/* packages at build time
const esmRequire = createRequire(import.meta.url);

const DEFAULT_SIZE = '24px';

// ── Caches ──────────────────────────────────────────────────────────────────

// Iconify icon sets (@iconify-json/*)
const iconSetCache = new Map<string, Record<string, { body: string; width?: number; height?: number }>>();
const iconSetMeta = new Map<string, { width: number; height: number }>();

// Custom SVG files from public/
const svgFileCache = new Map<string, { body: string; viewBox: string; style: string | null } | null>();

// ── Regex ───────────────────────────────────────────────────────────────────

/**
 * Matches Iconify icons (%prefix/icon-name%) or custom SVG file paths (%/path/to/icon.svg%).
 *
 * Groups:
 *   1: identifier (e.g. "ri/home-line", "/icons/star.svg")
 *   2: optional params (e.g. "20px red")
 */
const ICON_REGEX =
  /%([a-z][a-z0-9]*(?:-[a-z0-9]+)*\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*|\/[a-zA-Z0-9_][a-zA-Z0-9_.\-/]*\.svg)(?:\s+([^%]*?))?%/g;

/** Matches a size token like "20", "20px", "1.5em", "1.5rem" */
const SIZE_REGEX = /^(\d+(?:\.\d+)?)(px|em|rem)?$/;

// ── Color Validation ────────────────────────────────────────────────────────

/** Validate a CSS color value — supports hex, named, rgb, hsl, oklch, oklab, lch, lab */
function isValidCssColor(value: string): boolean {
  const v = value.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return true;
  if (/^(rgba?|hsla?|oklch|oklab|lch|lab|color)\([\d\s,%./\-a-zA-Z]+\)$/.test(v)) return true;
  if (/^[a-zA-Z]{3,30}$/.test(v) && v !== 'expression' && v !== 'javascript') return true;
  return false;
}

// ── Iconify Loaders ─────────────────────────────────────────────────────────

/** Load an Iconify JSON icon set by prefix (e.g. "ri", "fa6-solid") */
function loadIconSet(prefix: string): boolean {
  if (iconSetCache.has(prefix)) return true;
  try {
    const data = esmRequire(`@iconify-json/${prefix}`);
    const iconSet = data.icons || data;
    iconSetCache.set(prefix, iconSet.icons || {});
    iconSetMeta.set(prefix, { width: iconSet.width || 24, height: iconSet.height || 24 });
    return true;
  } catch {
    return false;
  }
}

function getIconSvg(prefix: string, name: string): string | null {
  const icon = iconSetCache.get(prefix)?.[name];
  return icon?.body ?? null;
}

function getIconViewBox(prefix: string, name: string): { width: number; height: number } {
  const icon = iconSetCache.get(prefix)?.[name];
  const meta = iconSetMeta.get(prefix);
  return { width: icon?.width || meta?.width || 24, height: icon?.height || meta?.height || 24 };
}

// ── Custom SVG File Loader ──────────────────────────────────────────────────

/** Load a custom SVG file from the public/ directory */
function loadSvgFile(filePath: string): { body: string; viewBox: string; style: string | null } | null {
  if (svgFileCache.has(filePath)) return svgFileCache.get(filePath) ?? null;

  const publicDir = path.join(process.cwd(), 'public');
  const fullPath = path.resolve(publicDir, filePath.replace(/^\//, ''));
  if (!fullPath.startsWith(publicDir)) {
    console.warn(`[remark-iconify] Path traversal detected: "${filePath}". Skipping.`);
    svgFileCache.set(filePath, null);
    return null;
  }

  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    const svgAttrs = content.match(/<svg([^>]*)>/)?.[1] || '';
    const viewBox = svgAttrs.match(/viewBox="([^"]+)"/)?.[1] || '0 0 24 24';
    const style = svgAttrs.match(/style="([^"]+)"/)?.[1] || null;
    const body = content.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1]?.trim() || '';

    if (!body) {
      console.warn(`[remark-iconify] SVG file "${filePath}" has no inner content. Skipping.`);
      svgFileCache.set(filePath, null);
      return null;
    }

    const result = { body, viewBox, style };
    svgFileCache.set(filePath, result);
    return result;
  } catch {
    console.warn(`[remark-iconify] SVG file "${filePath}" not found in public/. Skipping.`);
    svgFileCache.set(filePath, null);
    return null;
  }
}

// ── Parameter Parsing ───────────────────────────────────────────────────────

interface ParsedParams {
  size: string;
  color: string | null;
}

/** Parse optional params string into size and color. */
function parseParams(raw: string | undefined): ParsedParams {
  const result: ParsedParams = { size: DEFAULT_SIZE, color: null };
  if (!raw || !raw.trim()) return result;

  const tokens = raw.trim().split(/\s+/);
  const colorParts: string[] = [];

  for (const token of tokens) {
    const sizeMatch = token.match(SIZE_REGEX);
    if (sizeMatch) {
      result.size = sizeMatch[2] ? token : `${token}px`;
    } else {
      colorParts.push(token);
    }
  }

  if (colorParts.length === 0) return result;

  const colorStr = colorParts.join(' ');
  if (isValidCssColor(colorStr)) {
    result.color = colorStr;
  } else {
    console.warn(`[remark-iconify] Invalid color value: "${colorStr}"`);
  }

  return result;
}

// ── SVG Builder ─────────────────────────────────────────────────────────────

interface BuildSvgOptions {
  /** Replace the entire style attribute (for custom SVGs with existing style) */
  styleOverride?: string;
}

/** Build inline SVG HTML string */
function buildSvg(
  body: string,
  viewBox: string | { width: number; height: number },
  size: string,
  color: string | null,
  opts?: BuildSvgOptions,
): string {
  const viewBoxStr = typeof viewBox === 'string' ? viewBox : `0 0 ${viewBox.width} ${viewBox.height}`;

  let styleAttr: string;
  if (opts?.styleOverride) {
    styleAttr = color ? `${opts.styleOverride};color:${escapeHtml(color)}` : opts.styleOverride;
  } else {
    const styles = [`width:${escapeHtml(size)}`, `height:${escapeHtml(size)}`];
    if (color) {
      styles.push(`color:${escapeHtml(color)}`);
    }
    styleAttr = styles.join(';');
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeHtml(viewBoxStr)}" class="iconify-inline" style="${styleAttr}" aria-hidden="true">${body}</svg>`;
}

// ── Plugin Entry ────────────────────────────────────────────────────────────

export function remarkIconifyInline() {
  return (tree: Root) => {
    visit(tree, 'text', (node, index, parent) => {
      if (index === undefined || !parent) return;
      if (!('children' in parent)) return;

      const text = node.value;
      ICON_REGEX.lastIndex = 0;
      const parts: PhrasingContent[] = [];
      let lastIndex = 0;

      for (let match = ICON_REGEX.exec(text); match !== null; match = ICON_REGEX.exec(text)) {
        if (match.index > lastIndex) {
          parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
        }

        const identifier = match[1];
        const rawParams = match[2];
        const { size, color } = parseParams(rawParams);

        let svg: string | null = null;

        if (identifier.startsWith('/')) {
          // ── Custom SVG file from public/ ──
          const svgData = loadSvgFile(identifier);
          if (svgData) {
            const hasExplicitParams = rawParams?.trim();
            if (!hasExplicitParams && svgData.style) {
              svg = buildSvg(svgData.body, svgData.viewBox, size, color, { styleOverride: svgData.style });
            } else {
              svg = buildSvg(svgData.body, svgData.viewBox, size, color);
            }
          }
        } else {
          // ── Iconify icon set ──
          const [prefix, name] = identifier.split('/');
          if (loadIconSet(prefix)) {
            const body = getIconSvg(prefix, name);
            if (body) {
              svg = buildSvg(body, getIconViewBox(prefix, name), size, color);
            } else {
              console.warn(`[remark-iconify] Icon "${name}" not found in set "${prefix}". Skipping %${identifier}%.`);
            }
          } else {
            console.warn(`[remark-iconify] Icon set "@iconify-json/${prefix}" not found. Skipping %${identifier}%.`);
          }
        }

        if (svg) {
          parts.push({ type: 'html', value: svg });
        } else {
          parts.push({ type: 'text', value: match[0] });
        }
        lastIndex = match.index + match[0].length;
      }

      if (parts.length === 0) return;

      if (lastIndex < text.length) {
        parts.push({ type: 'text', value: text.slice(lastIndex) });
      }

      parent.children.splice(index, 1, ...parts);
    });
  };
}
