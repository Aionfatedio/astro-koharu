/**
 * Remark plugin for GitHub-style alerts/callouts
 *
 * Supports two syntaxes:
 *
 * 1. GitHub Alerts syntax (blockquote-based):
 *    > [!NOTE]
 *    > Content here
 *
 * 2. Directive syntax (requires remark-directive):
 *    :::note
 *    Content here
 *    :::
 *
 *    :::note[Custom Title]
 *    Content with custom title
 *    :::
 *
 * Supported alert types: NOTE, TIP, IMPORTANT, WARNING, CAUTION
 *
 * Output HTML structure:
 *   <blockquote class="admonition bdm-{type}">
 *     <span class="bdm-title">{ICON} {LABEL}</span>
 *     <p>Content...</p>
 *   </blockquote>
 *
 * With custom title:
 *   <blockquote class="admonition bdm-{type}">
 *     <span class="bdm-title">{ICON} <div>{Custom Title}</div></span>
 *     <p>Content...</p>
 *   </blockquote>
 */

import type { Blockquote, Paragraph, Root, Text } from 'mdast';
import type { ContainerDirective } from 'mdast-util-directive';
import { visit } from 'unist-util-visit';

const ALERT_TYPES = {
  note: 'NOTE',
  tip: 'TIP',
  important: 'IMPORTANT',
  warning: 'WARNING',
  caution: 'CAUTION',
} as const;

type AlertType = keyof typeof ALERT_TYPES;

// Inline SVG icons (GitHub Octicons style, 16x16)
const ICON_SVGS: Record<AlertType, string> = {
  note: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>',
  
  tip: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"/></svg>',
  
  important:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>',
  
  warning:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>',
  
  caution:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4.47.22A.749.749 0 0 1 5 .22h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16.22H5a.749.749 0 0 1-.53-.22L.22 11.75A.749.749 0 0 1 0 11.22v-6c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>',
};

function parseGitHubAlertType(text: string): AlertType | null {
  const match = text.match(/^\[!(\w+)\]\s*/i);
  if (match) {
    const type = match[1].toLowerCase();
    if (type in ALERT_TYPES) return type as AlertType;
  }
  return null;
}

/**
 * Build the bdm-title span as a hast element.
 * Default: <span class="bdm-title">{icon} LABEL</span>
 * Custom:  <span class="bdm-title">{icon} <div>Custom Title</div></span>
 */
function buildTitleHast(type: AlertType, customTitle?: string) {
  const label = ALERT_TYPES[type];
  const icon = ICON_SVGS[type];

  const children: Array<{ type: string; value?: string; tagName?: string; properties?: object; children?: unknown[] }> = [
    { type: 'raw', value: icon },
  ];

  if (customTitle) {
    children.push({ type: 'text', value: ' ' });
    children.push({
      type: 'element',
      tagName: 'div',
      properties: {},
      children: [{ type: 'text', value: customTitle }],
    });
  } else {
    children.push({ type: 'text', value: ` ${label}` });
  }

  return {
    type: 'element' as const,
    tagName: 'span',
    properties: { class: 'bdm-title' },
    children,
  };
}

export function remarkGitHubAlerts() {
  return (tree: Root) => {
    // 1. Process blockquote-based GitHub alerts: > [!NOTE]
    visit(tree, 'blockquote', (node: Blockquote) => {
      if (node.children.length === 0) return;
      const firstChild = node.children[0];
      if (firstChild.type !== 'paragraph') return;

      const paragraph = firstChild as Paragraph;
      if (paragraph.children.length === 0) return;

      const firstText = paragraph.children[0];
      if (firstText.type !== 'text') return;

      const alertType = parseGitHubAlertType((firstText as Text).value);
      if (!alertType) return;

      // Remove [!TYPE] prefix
      const remaining = (firstText as Text).value.replace(/^\[!\w+\]\s*/, '');
      if (remaining.trim()) {
        (firstText as Text).value = remaining;
      } else {
        paragraph.children.shift();
        if (paragraph.children.length === 0) {
          node.children.shift();
        }
      }

      // Set hast properties on the blockquote
      if (!node.data) node.data = {};
      node.data.hProperties = {
        class: `admonition bdm-${alertType}`,
      };

      // Prepend the title span as first child (via hChildren would override content,
      // so we insert a raw HTML node into the mdast tree instead)
      const titleNode = {
        type: 'html' as const,
        value: `<span class="bdm-title">${ICON_SVGS[alertType]} ${ALERT_TYPES[alertType]}</span>`,
      };
      node.children.unshift(titleNode as unknown as Paragraph);
    });

    // 2. Process directive-based alerts: :::note / :::note[Custom Title]
    visit(tree, (node) => {
      if (node.type !== 'containerDirective') return;

      const directive = node as ContainerDirective;
      const name = directive.name.toLowerCase();
      if (!(name in ALERT_TYPES)) return;

      const alertType = name as AlertType;

      // Extract custom title from :::note[Custom Title] syntax
      // remark-directive stores the label in the first paragraph's directiveLabel data
      let customTitle: string | undefined;
      if (directive.children.length > 0 && directive.children[0].type === 'paragraph') {
        const firstPara = directive.children[0] as Paragraph & { data?: { directiveLabel?: boolean } };
        if (firstPara.data?.directiveLabel) {
          // The first paragraph IS the label - extract its text content
          customTitle = firstPara.children
            .filter((c): c is Text => c.type === 'text')
            .map((c) => c.value)
            .join('');
          // Remove the label paragraph from children
          directive.children.shift();
        }
      }

      // Transform to blockquote
      if (!directive.data) directive.data = {};
      directive.data.hName = 'blockquote';
      directive.data.hProperties = {
        class: `admonition bdm-${alertType}`,
      };

      // Build title HTML
      const titleHtml = customTitle
        ? `<span class="bdm-title">${ICON_SVGS[alertType]} <div>${customTitle}</div></span>`
        : `<span class="bdm-title">${ICON_SVGS[alertType]} ${ALERT_TYPES[alertType]}</span>`;

      // Insert title as first child
      const titleNode = {
        type: 'html' as const,
        value: titleHtml,
      };
      directive.children.unshift(titleNode as unknown as Paragraph);
    });
  };
}
