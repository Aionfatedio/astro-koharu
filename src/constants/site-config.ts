// Import YAML config directly - processed by @rollup/plugin-yaml

import { normalizeSiteYamlConfig } from '@lib/config/normalize';
import type {
  AnalyticsConfig,
  BgmAudioGroup,
  CommentConfig,
  ContentConfig,
  DevConfig,
  FeaturedCategory,
  FeaturedSeriesItem,
  SiteBasicConfig,
} from '@lib/config/types';
import { createUmamiStatsConfig } from '@lib/umami-stats';
import type { UmamiStatsConfig } from '@/types/umami-stats';
import rawYamlConfig from '../../config/site.yaml';

const yamlConfig = normalizeSiteYamlConfig(rawYamlConfig);

/**
 * Runtime site configuration
 * Extends SiteBasicConfig with runtime-specific fields
 */
type SiteConfig = Omit<SiteBasicConfig, 'url'> & {
  /** Site URL (mapped from SiteBasicConfig.url) */
  site: string;
  featuredCategories?: FeaturedCategory[];
  /** Normalized array of featured series */
  featuredSeries: FeaturedSeriesItem[];
};

type SocialPlatform = {
  url: string;
  icon: string;
  color: string;
};

type SocialConfig = {
  github?: SocialPlatform;
  google?: SocialPlatform;
  twitter?: SocialPlatform;
  zhihu?: SocialPlatform;
  music?: SocialPlatform;
  weibo?: SocialPlatform;
  about?: SocialPlatform;
  email?: SocialPlatform;
  facebook?: SocialPlatform;
  stackoverflow?: SocialPlatform;
  youtube?: SocialPlatform;
  instagram?: SocialPlatform;
  skype?: SocialPlatform;
  douban?: SocialPlatform;
  bilibili?: SocialPlatform;
  rss?: SocialPlatform;
};

// Map YAML config to existing types
export const siteConfig: SiteConfig = {
  title: yamlConfig.site.title,
  alternate: yamlConfig.site.alternate,
  subtitle: yamlConfig.site.subtitle,
  name: yamlConfig.site.name,
  description: yamlConfig.site.description,
  avatar: yamlConfig.site.avatar,
  showLogo: yamlConfig.site.showLogo,
  author: yamlConfig.site.author,
  site: yamlConfig.site.url,
  startYear: yamlConfig.site.startYear,
  defaultOgImage: yamlConfig.site.defaultOgImage,
  keywords: yamlConfig.site.keywords,
  breadcrumbHome: yamlConfig.site.breadcrumbHome,
  featuredCategories: yamlConfig.featuredCategories,
  featuredSeries: yamlConfig.featuredSeries,
  enableSlugTransliteration: yamlConfig.site.enableSlugTransliteration,
};

export const socialConfig: SocialConfig = yamlConfig.social ?? {};

const { title, alternate, subtitle } = siteConfig;

export const seoConfig = {
  title: `${alternate ? `${alternate} = ` : ''}${title}${subtitle ? ` = ${subtitle}` : ''}`,
  description: siteConfig.description,
  keywords: siteConfig?.keywords?.join(',') ?? '',
  url: siteConfig.site,
};

const BUILT_IN_COVERS = Array.from({ length: 21 }, (_, i) => `/img/cover/${i + 1}.webp`);
export const defaultCoverList = yamlConfig?.defaultCoverList?.length ? yamlConfig.defaultCoverList : BUILT_IN_COVERS;

// Analytics config — reuses AnalyticsConfig from config/types.ts

// Christmas config types
type ChristmasConfig = {
  enabled: boolean;
  features: {
    snowfall: boolean;
    christmasColorScheme: boolean;
    christmasCoverDecoration: boolean;
    christmasHat: boolean;
    readingTimeSnow: boolean;
  };
  snowfall: {
    speed: number;
    intensity: number;
    mobileIntensity: number;
    maxLayers: number;
    maxIterations: number;
    mobileMaxLayers: number;
    mobileMaxIterations: number;
  };
};

// Map YAML comment config
export const commentConfig: CommentConfig = yamlConfig.comment;

// Map YAML content config
export const contentConfig: ContentConfig = yamlConfig.content;

// Map YAML analytics config
const analyticsConfig: AnalyticsConfig = yamlConfig.analytics;

const _umami = analyticsConfig?.umami;

/** Pre-computed site-wide pageview stats config. null when disabled or token missing. */
export const umamiSiteStatsConfig: UmamiStatsConfig | null =
  _umami?.enabled && _umami.statistics_display?.token && _umami.statistics_display?.footer_site_stats
    ? createUmamiStatsConfig(_umami)
    : null;

/** Create per-page article stats config. Returns null when disabled or token missing. */
export function createArticleStatsConfig(href: string): UmamiStatsConfig | null {
  return _umami?.enabled && _umami.statistics_display?.token && _umami.statistics_display?.article_page_views
    ? createUmamiStatsConfig(_umami, href)
    : null;
}

// Map YAML christmas config with defaults
export const christmasConfig: ChristmasConfig = yamlConfig.christmas;

// Map YAML bgm config
export const bgmConfig: { enabled: boolean; metingApi?: string; audio: BgmAudioGroup[] } = {
  enabled: yamlConfig.bgm.enabled,
  metingApi: yamlConfig.bgm.metingApi,
  audio: yamlConfig.bgm.audio,
};

// Map YAML dev tools config with defaults (dev only)
export const devConfig: DevConfig = yamlConfig.dev;

// =============================================================================
// Site Timezone
// =============================================================================

/**
 * Site timezone in IANA format
 * Defaults to 'Asia/Shanghai' and throws during config normalization if invalid.
 * @default 'Asia/Shanghai'
 */
export const siteTimezone: string = (() => {
  return yamlConfig.site.timezone;
})();

// =============================================================================
// Series Slugs (Pre-computed for navigation filtering)
// =============================================================================

/** All configured series slugs (lowercase) */
export const configuredSeriesSlugs = new Set(siteConfig.featuredSeries.map((series) => series.slug.toLowerCase()));

/** Only enabled series slugs (lowercase) */
export const enabledSeriesSlugs = new Set(
  siteConfig.featuredSeries.flatMap((series) => (series.enabled !== false ? [series.slug.toLowerCase()] : [])),
);
