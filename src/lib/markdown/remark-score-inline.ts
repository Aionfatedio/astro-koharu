/**
 * Remark plugin for artist score badges.
 *
 * Recommended syntax:
 *   %score 7/10%
 *
 * Compatibility syntax:
 *   ::score{7/10}
 */
import type { PhrasingContent, Root } from 'mdast';
import { visit } from 'unist-util-visit';
import { renderInlineIcon } from './remark-iconify-inline';
import { escapeHtml } from './shoka-renderers';

const SCORE_REGEX = /(?:%score\s+(\d+(?:\.\d+)?\/\d+(?:\.\d+)?)%|::score\{(\d+(?:\.\d+)?\/\d+(?:\.\d+)?)\})/g;

type Grade = 'd' | 'c' | 'b' | 'a' | 's' | 's-plus';
type StarKind = 'full' | 'half' | 'empty';

interface ParsedScore {
  raw: string;
  numerator: number;
  denominator: number;
  normalized: number;
}

interface GradeConfig {
  className: string;
  icon: string;
  color: string;
  stars: StarKind[];
}

const FULL_STAR = 'fa7-solid/star';
const HALF_STAR = '/img/icon/half-star.svg';
const SUPER_PLUS = '/img/icon/superplus.svg';
const STAR_COLOR = '#ffd306';

const GRADE_CONFIG: Record<Grade, GradeConfig> = {
  d: {
    className: 'artist-score-grade-d',
    icon: 'fa7-solid/d',
    color: '#9D9D9D',
    stars: ['full', 'empty', 'empty', 'empty', 'empty'],
  },
  c: {
    className: 'artist-score-grade-c',
    icon: 'fa7-solid/c',
    color: '#00f57a',
    stars: ['full', 'half', 'empty', 'empty', 'empty'],
  },
  b: {
    className: 'artist-score-grade-b',
    icon: 'fa7-solid/b',
    color: '#00BFFF',
    stars: ['full', 'full', 'full', 'empty', 'empty'],
  },
  a: {
    className: 'artist-score-grade-a',
    icon: 'fa7-solid/a',
    color: '#b250f4',
    stars: ['full', 'full', 'full', 'full', 'empty'],
  },
  s: {
    className: 'artist-score-grade-s',
    icon: 'fa7-solid/s',
    color: '#fbbf24',
    stars: ['full', 'full', 'full', 'full', 'half'],
  },
  's-plus': {
    className: 'artist-score-grade-s-plus',
    icon: SUPER_PLUS,
    color: '#ff5f56',
    stars: ['full', 'full', 'full', 'full', 'full'],
  },
};

function parseScore(raw: string): ParsedScore | null {
  const [rawNumerator, rawDenominator] = raw.split('/');
  const numerator = Number(rawNumerator);
  const denominator = Number(rawDenominator);

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (numerator < 0 || denominator <= 0 || numerator > denominator) return null;

  return {
    raw,
    numerator,
    denominator,
    normalized: (numerator / denominator) * 10,
  };
}

function getGrade(score: ParsedScore): Grade {
  if (score.numerator === score.denominator) return 's-plus';
  if (score.normalized > 8) return 's';
  if (score.normalized > 6) return 'a';
  if (score.normalized > 4) return 'b';
  if (score.normalized > 2) return 'c';
  return 'd';
}

function wrapIcon(svg: string, className: string): string {
  return `<span class="${className}" aria-hidden="true">${svg}</span>`;
}

function renderStar(kind: StarKind): string | null {
  if (kind === 'full') {
    const svg = renderInlineIcon(FULL_STAR, STAR_COLOR);
    return svg ? wrapIcon(svg, 'artist-score-icon artist-score-star-full') : null;
  }

  if (kind === 'half') {
    const svg = renderInlineIcon(HALF_STAR);
    return svg ? wrapIcon(svg, 'artist-score-icon artist-score-star-half') : null;
  }

  const svg = renderInlineIcon(FULL_STAR);
  return svg ? wrapIcon(svg, 'artist-score-icon artist-score-star-empty') : null;
}

function renderGrade(config: GradeConfig): string | null {
  const svg = renderInlineIcon(config.icon, config.color);
  return svg ? wrapIcon(svg, `artist-score-grade ${config.className}`) : null;
}

function renderScore(raw: string): string | null {
  const score = parseScore(raw);
  if (!score) return null;

  const config = GRADE_CONFIG[getGrade(score)];
  const stars = config.stars.map(renderStar);
  const grade = renderGrade(config);
  if (stars.some((star) => star === null) || !grade) return null;

  const tooltip = `${score.raw}`;

  return [
    `<span class="artist-score" data-tooltip="${escapeHtml(tooltip)}" aria-label="${escapeHtml(tooltip)}" tabindex="0">`,
    `<span class="artist-score-stars">${stars.join('')}</span>`,
    grade,
    '</span>',
  ].join('');
}

export function remarkScoreInline() {
  return (tree: Root) => {
    visit(tree, 'text', (node, index, parent) => {
      if (index === undefined || !parent) return;
      if (!('children' in parent)) return;

      const text = node.value;
      SCORE_REGEX.lastIndex = 0;
      const parts: PhrasingContent[] = [];
      let lastIndex = 0;

      for (let match = SCORE_REGEX.exec(text); match !== null; match = SCORE_REGEX.exec(text)) {
        if (match.index > lastIndex) {
          parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
        }

        const rawScore = match[1] || match[2];
        const html = renderScore(rawScore);
        parts.push(html ? { type: 'html', value: html } : { type: 'text', value: match[0] });
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
