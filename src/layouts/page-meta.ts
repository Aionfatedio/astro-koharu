/**
 * Document-metadata contract between pages, `Layout` and `HeadMeta`.
 *
 * `HeadMeta` owns every `<head>` derivation (canonical, OG image fallbacks,
 * RSS links); pages only describe *what* the page is.
 */

export interface PageOpenGraph {
  title?: string;
  description?: string;
  /** Relative paths are resolved against `Astro.site`. */
  image?: string;
  type?: 'website' | 'article';
  url?: string;
}

export interface RssFeedLink {
  href: string;
  title: string;
}

/** Metadata a page may override. Every field is optional — `HeadMeta` fills the defaults. */
export interface PageMetaProps {
  /** Override the canonical URL for this page. */
  canonical?: string;
  keywords?: string[];
  openGraph?: PageOpenGraph;
  /** Robots directive for dynamic or otherwise non-indexable pages. */
  robots?: string;
  /** Alternate RSS feeds. Pass `[]` to emit none; omit to keep the site's default feed. */
  rssFeeds?: RssFeedLink[];
}

export interface PageMeta extends PageMetaProps {
  title: string;
  description?: string;
  /** Cover image seeding the OG image fallback chain (cover → defaultOgImage → avatar). */
  coverImage?: string;
}
