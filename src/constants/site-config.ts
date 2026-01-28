// Import YAML config directly - processed by @rollup/plugin-yaml

import type { ArtistInfo, CMSConfig, CommentConfig, FeaturedSeriesItem } from '@lib/config/types';
import artistsYaml from '../../config/artists.yaml';
import rawCmsConfig from '../../config/cms.yaml';
import yamlConfig from '../../config/site.yaml';
import { isReservedSlug, RESERVED_ROUTES } from './router';

type SiteConfig = {
  title: string;
  alternate?: string;
  subtitle?: string;
  name: string;
  description?: string;
  avatar?: string;
  showLogo?: boolean;
  author?: string;
  site: string;
  startYear?: number;
  defaultOgImage?: string;
  keywords?: string[];
  featuredCategories?: {
    link: string;
    image: string;
    label?: string;
    description?: string;
  }[];
  /** Normalized array of featured series */
  featuredSeries: FeaturedSeriesItem[];
};

/**
 * Type guard to check if an unknown value is a valid FeaturedSeriesItem
 * @param value - The value to check
 * @returns true if the value is a valid FeaturedSeriesItem
 */
function isFeaturedSeriesItem(value: unknown): value is FeaturedSeriesItem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const item = value as Record<string, unknown>;

  // Check required field: categoryName must be a non-empty string
  if (typeof item.categoryName !== 'string' || item.categoryName.trim() === '') {
    return false;
  }

  // Check optional but important fields
  if (item.slug !== undefined && typeof item.slug !== 'string') {
    return false;
  }

  if (item.label !== undefined && typeof item.label !== 'string') {
    return false;
  }

  if (item.enabled !== undefined && typeof item.enabled !== 'boolean') {
    return false;
  }

  return true;
}

/**
 * Normalize featured series config to array format
 * Supports both legacy single object and new array format
 * Validates all series configurations at build time
 */
function normalizeFeaturedSeries(config: unknown): FeaturedSeriesItem[] {
  if (!config) return [];

  // Convert to array format
  let items: unknown[];
  if (Array.isArray(config)) {
    items = config;
  } else {
    // Legacy single object format - convert to array with default slug
    items = [config];
  }

  // Validate each item using type guard
  const validatedItems: FeaturedSeriesItem[] = [];
  for (const [index, item] of items.entries()) {
    if (!isFeaturedSeriesItem(item)) {
      const itemStr = JSON.stringify(item, null, 2);
      throw new Error(
        `Featured series configuration error: Item at index ${index} is not a valid FeaturedSeriesItem.\n` +
          `Expected an object with at least a 'categoryName' string field.\n` +
          `Received: ${itemStr}`,
      );
    }

    // Add default slug for legacy configs
    const slug = item.slug || yamlConfig.categoryMap?.[item.categoryName] || 'series';
    validatedItems.push({ ...item, slug });
  }

  // Validate each series configuration
  const slugSet = new Set<string>();

  for (const item of validatedItems) {
    const rawSlug = typeof item.slug === 'string' ? item.slug : '';
    const normalizedSlug = rawSlug.trim().toLowerCase();

    // Validate required fields
    if (!normalizedSlug) {
      throw new Error(
        `Featured series configuration error: Missing or invalid "slug" field. ` + `Each series must have a non-empty slug.`,
      );
    }

    if (!item.categoryName || typeof item.categoryName !== 'string' || item.categoryName.trim() === '') {
      throw new Error(
        `Featured series configuration error: Series "${item.slug}" is missing or has invalid "categoryName" field. ` +
          `Each series must have a valid category name.`,
      );
    }

    // Validate slug format (alphanumeric, hyphens, underscores only)
    const slugPattern = /^[a-z0-9-_]+$/i;
    if (!slugPattern.test(normalizedSlug)) {
      throw new Error(
        `Featured series configuration error: Invalid slug "${rawSlug}". ` +
          `Slugs must contain only alphanumeric characters, hyphens, and underscores.`,
      );
    }

    // Check for reserved slugs
    if (isReservedSlug(normalizedSlug)) {
      throw new Error(
        `Featured series configuration error: Slug "${rawSlug}" conflicts with a reserved route. ` +
          `Reserved routes are: ${Array.from(RESERVED_ROUTES).join(', ')}. ` +
          `Please choose a different slug.`,
      );
    }

    // Check for duplicate slugs
    if (slugSet.has(normalizedSlug)) {
      throw new Error(`Featured series configuration error: Duplicate slug "${rawSlug}". Each series must have a unique slug.`);
    }
    slugSet.add(normalizedSlug);
    item.slug = normalizedSlug;

    // Validate categoryName exists in categoryMap
    if (yamlConfig.categoryMap && !yamlConfig.categoryMap[item.categoryName]) {
      console.warn(
        `[Warning] Featured series "${item.slug}": Category "${item.categoryName}" not found in categoryMap. ` +
          `Consider adding it to config/site.yaml for proper URL mapping.`,
      );
    }
  }

  return validatedItems;
}

type SocialPlatform = {
  url: string;
  icon: string;
  color: string;
};

// Use Record to allow dynamic social platforms from YAML
// No longer restricted to predefined platforms
type SocialConfig = Record<string, SocialPlatform>;

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
  featuredCategories: yamlConfig.featuredCategories,
  featuredSeries: normalizeFeaturedSeries(yamlConfig.featuredSeries),
};

export const socialConfig: SocialConfig = yamlConfig.social ?? {};

// Social platform templates (icon/color only, for artist pages)
type SocialPlatformTemplate = {
  icon: string;
  color: string;
};
export const socialPlatformsConfig: Record<string, SocialPlatformTemplate> = yamlConfig.socialPlatforms ?? {};

const { title, alternate, subtitle } = siteConfig;

export const seoConfig = {
  title: `${alternate ? `${alternate} = ` : ''}${title}${subtitle ? ` = ${subtitle}` : ''}`,
  description: siteConfig.description,
  keywords: siteConfig?.keywords?.join(',') ?? '',
  url: siteConfig.site,
};

export const defaultCoverList = Array.from({ length: 21 }, (_, index) => index + 1).map((item) => `/img/cover/${item}.webp`);

// Analytics config types
type AnalyticsConfig = {
  umami?: {
    enabled: boolean;
    id: string;
    endpoint: string;
  };
};

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
export const commentConfig: CommentConfig = yamlConfig.comment || {};

// Map YAML analytics config
export const analyticsConfig: AnalyticsConfig = yamlConfig.analytics || {};

// Map YAML christmas config with defaults
export const christmasConfig: ChristmasConfig = yamlConfig.christmas || {
  enabled: false,
  features: {
    snowfall: true,
    christmasColorScheme: true,
    christmasCoverDecoration: true,
    christmasHat: true,
    readingTimeSnow: true,
  },
  snowfall: {
    speed: 0.5,
    intensity: 0.7,
    mobileIntensity: 0.4,
    maxLayers: 6,
    maxIterations: 8,
    mobileMaxLayers: 4,
    mobileMaxIterations: 6,
  },
};

// Map YAML CMS config with defaults
export const cmsConfig: CMSConfig = {
  enabled: rawCmsConfig?.enabled ?? false,
  localProjectPath: rawCmsConfig?.localProjectPath ?? '',
  contentRelativePath: rawCmsConfig?.contentRelativePath ?? 'src/content/blog',
  editors: rawCmsConfig?.editors ?? [],
};

// =============================================================================
// Series Slugs (Pre-computed for navigation filtering)
// =============================================================================

/** All configured series slugs (lowercase) */
export const configuredSeriesSlugs = new Set(siteConfig.featuredSeries.map((series) => series.slug.toLowerCase()));

/** Only enabled series slugs (lowercase) */
export const enabledSeriesSlugs = new Set(
  siteConfig.featuredSeries.filter((series) => series.enabled !== false).map((series) => series.slug.toLowerCase()),
);

// =============================================================================
// Artists Configuration
// =============================================================================

/** All artists from config/artists.yaml */
export const artistsConfig: ArtistInfo[] = artistsYaml?.artists ?? [];

/**
 * Get artist info by ID
 * @param id Artist ID from frontmatter
 * @returns Artist info or null if not found
 */
export function getArtistById(id: string): ArtistInfo | null {
  if (!id) return null;
  return artistsConfig.find((artist) => artist.id === id) ?? null;
}

/**
 * Build artist social config by merging artist URLs with platform templates (icon/color)
 * Priority: socialPlatformsConfig (templates) > socialConfig (admin's social links)
 * @param artist Artist info
 * @returns Social config with merged icon/color from platform templates
 */
export function buildArtistSocialConfig(artist: ArtistInfo): Record<string, { url: string; icon: string; color: string }> {
  if (!artist.social) return {};

  const result: Record<string, { url: string; icon: string; color: string }> = {};

  for (const [platform, url] of Object.entries(artist.social)) {
    // First try to get icon/color from platform templates (socialPlatforms)
    const platformTemplate = socialPlatformsConfig[platform];
    if (platformTemplate) {
      result[platform] = {
        url,
        icon: platformTemplate.icon,
        color: platformTemplate.color,
      };
      continue;
    }

    // Fallback to admin's social config if platform template not found
    const sitePlatformConfig = socialConfig[platform];
    if (sitePlatformConfig) {
      result[platform] = {
        url,
        icon: sitePlatformConfig.icon,
        color: sitePlatformConfig.color,
      };
    }
    // If platform not in either config, skip it (no icon/color available)
  }

  return result;
}
