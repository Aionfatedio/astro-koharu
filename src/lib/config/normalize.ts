import { DEFAULT_TIMEZONE, isValidTimezone } from '../timezone';
import type {
  AnalyticsConfig,
  BgmConfig,
  ChristmasConfig,
  CommentConfig,
  ContentConfig,
  DevConfig,
  FeaturedCategory,
  FeaturedSeriesItem,
  FriendLink,
  FriendsConfig,
  RouterItem,
  SeoConfig,
  SiteBasicConfig,
  SiteYamlConfig,
} from './types';

export const RESERVED_ROUTE_SLUGS = [
  'about',
  'categories',
  'tags',
  'friends',
  'post',
  'posts',
  'archives',
  '404',
  'rss.xml',
  'sitemap.xml',
  'robots.txt',
  'favicon.ico',
  '_astro',
  '@fs',
  'api',
] as const;

const DEFAULT_CONTENT_CONFIG: ContentConfig = {
  addBlankTarget: true,
  smoothScroll: true,
  addHeadingLevel: true,
  enhanceCodeBlock: true,
  enableCodeCopy: true,
  enableCodeFullscreen: true,
  enableLinkEmbed: true,
  enableTweetEmbed: true,
  enableOGPreview: true,
  enableCodePenEmbed: true,
  previewCacheTime: 30,
  lazyLoadEmbeds: true,
  enableShokaContainers: true,
  enableShokaAttrs: true,
  enableShokaEffects: true,
  enableShokaSpoiler: true,
  enableShokaRuby: true,
  enableShokaHexoTags: true,
  enableMath: true,
  enableCodeMeta: true,
  enableQuiz: true,
  enableEncryptedBlock: false,
  enableComicCard: false,
  enableIconifyInline: true,
};

const DEFAULT_CHRISTMAS_CONFIG: ChristmasConfig = {
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

const DEFAULT_DEV_CONFIG: DevConfig = {
  localProjectPath: '',
  contentRelativePath: 'src/content/blog',
  editors: [],
};

const DEFAULT_NAVIGATION: RouterItem[] = [
  { name: 'Home', path: '/', icon: 'fa6-solid:house-chimney' },
  { name: 'About', path: '/about', icon: 'fa6-regular:circle-user' },
];

const DEFAULT_FRIENDS_CONFIG: FriendsConfig = {
  intro: {
    title: 'Friends',
    subtitle: '',
    applyTitle: 'Apply for friend link',
    applyDesc: 'Leave a comment with the following format',
  },
  data: [],
};

export interface NormalizedSiteYamlConfig
  extends Omit<
    SiteYamlConfig,
    'site' | 'content' | 'featuredSeries' | 'christmas' | 'bgm' | 'dev' | 'comment' | 'analytics' | 'seo'
  > {
  site: SiteBasicConfig & { timezone: string };
  categoryMap: Record<string, string>;
  content: ContentConfig;
  featuredCategories: FeaturedCategory[];
  featuredSeries: FeaturedSeriesItem[];
  navigation: RouterItem[];
  friends: FriendsConfig;
  announcements: NonNullable<SiteYamlConfig['announcements']>;
  comment: CommentConfig;
  analytics: AnalyticsConfig;
  seo: SeoConfig;
  christmas: ChristmasConfig;
  bgm: Required<Pick<BgmConfig, 'enabled' | 'audio'>> & Pick<BgmConfig, 'metingApi'>;
  dev: DevConfig;
}

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`${label} must be an object.`);
  }
}

function requireStringField(value: Record<string, unknown>, field: string, label: string): string {
  const fieldValue = value[field];
  if (typeof fieldValue !== 'string' || !fieldValue.trim()) {
    throw new Error(`${label}.${field} must be a non-empty string.`);
  }
  return fieldValue;
}

function validateCategoryMap(categoryMap: Record<string, string> | undefined): Record<string, string> {
  const map = categoryMap ?? {};
  const seenSlugs = new Map<string, string>();
  const slugPattern = /^[a-z0-9][a-z0-9-_]*$/i;

  for (const [name, slug] of Object.entries(map)) {
    if (!name.trim()) {
      throw new Error('categoryMap contains an empty category name.');
    }
    if (!slugPattern.test(slug)) {
      throw new Error(`categoryMap entry "${name}" has invalid slug "${slug}".`);
    }

    const existingName = seenSlugs.get(slug);
    if (existingName) {
      throw new Error(`categoryMap entries "${existingName}" and "${name}" use the same slug "${slug}".`);
    }
    seenSlugs.set(slug, name);
  }

  return map;
}

function validateFeaturedCategoryLinks(featuredCategories: FeaturedCategory[], categoryMap: Record<string, string>): void {
  const knownSlugs = new Set(Object.values(categoryMap));

  for (const category of featuredCategories) {
    const segments = category.link.split('/').filter(Boolean);
    if (segments.length === 0) {
      throw new Error('featuredCategories.link cannot be empty.');
    }
    for (const segment of segments) {
      if (!knownSlugs.has(segment)) {
        throw new Error(`featuredCategories link "${category.link}" references unknown category slug "${segment}".`);
      }
    }
  }
}

function normalizeFeaturedSeries(
  config: SiteYamlConfig['featuredSeries'],
  categoryMap: Record<string, string>,
): FeaturedSeriesItem[] {
  if (!config) return [];

  const items = Array.isArray(config) ? config : [config];
  const slugSet = new Set<string>();
  const reservedSlugs = new Set<string>(RESERVED_ROUTE_SLUGS);
  const slugPattern = /^[a-z0-9-_]+$/i;

  return items.map((item, index) => {
    assertObject(item, `featuredSeries[${index}]`);

    const rawSlug = item.slug;
    const categoryName = item.categoryName;

    if (typeof rawSlug !== 'string' || !rawSlug.trim()) {
      throw new Error(`featuredSeries[${index}].slug is required.`);
    }
    if (typeof categoryName !== 'string' || !categoryName.trim()) {
      throw new Error(`featuredSeries[${index}].categoryName is required.`);
    }
    if (!categoryMap[categoryName]) {
      throw new Error(`featuredSeries "${rawSlug}" references category "${categoryName}" missing from categoryMap.`);
    }

    const slug = rawSlug.trim().toLowerCase();
    if (!slugPattern.test(slug)) {
      throw new Error(`featuredSeries[${index}].slug "${rawSlug}" contains invalid characters.`);
    }
    if (reservedSlugs.has(slug)) {
      throw new Error(`featuredSeries[${index}].slug "${rawSlug}" conflicts with a reserved route.`);
    }
    if (slugSet.has(slug)) {
      throw new Error(`featuredSeries[${index}].slug "${rawSlug}" is duplicated.`);
    }
    slugSet.add(slug);

    return {
      ...(item as FeaturedSeriesItem),
      slug,
    };
  });
}

function normalizeContentConfig(config: Partial<ContentConfig> | undefined): ContentConfig {
  return {
    ...DEFAULT_CONTENT_CONFIG,
    ...(config ?? {}),
  };
}

function normalizeChristmasConfig(config: ChristmasConfig | undefined): ChristmasConfig {
  if (!config) return DEFAULT_CHRISTMAS_CONFIG;

  return {
    ...DEFAULT_CHRISTMAS_CONFIG,
    ...config,
    features: {
      ...DEFAULT_CHRISTMAS_CONFIG.features,
      ...config.features,
    },
    snowfall: {
      ...DEFAULT_CHRISTMAS_CONFIG.snowfall,
      ...config.snowfall,
    },
  };
}

function normalizeBgmConfig(config: BgmConfig | undefined): NormalizedSiteYamlConfig['bgm'] {
  const audio = config?.audio ?? [];
  return {
    enabled: config?.enabled ?? audio.length > 0,
    metingApi: config?.metingApi,
    audio,
  };
}

function normalizeDevConfig(config: Partial<DevConfig> | undefined): DevConfig {
  return {
    ...DEFAULT_DEV_CONFIG,
    ...(config ?? {}),
    editors: config?.editors ?? DEFAULT_DEV_CONFIG.editors,
  };
}

function normalizeFriendLinks(data: unknown): FriendLink[] {
  if (data === undefined || data === null) return [];
  if (!Array.isArray(data)) {
    throw new Error('friends.data must be an array.');
  }

  return data.map((item, index) => {
    const label = `friends.data[${index}]`;
    assertObject(item, label);

    const friend: FriendLink = {
      site: requireStringField(item, 'site', label),
      url: requireStringField(item, 'url', label),
      owner: requireStringField(item, 'owner', label),
      desc: requireStringField(item, 'desc', label),
      image: requireStringField(item, 'image', label),
    };

    const color = item.color;
    if (color !== undefined) {
      if (typeof color !== 'string' || !color.trim()) {
        throw new Error(`${label}.color must be a non-empty string when provided.`);
      }
      friend.color = color;
    }

    return friend;
  });
}

function normalizeFriendsConfig(config: Partial<FriendsConfig> | undefined): FriendsConfig {
  if (!config) return DEFAULT_FRIENDS_CONFIG;

  return {
    intro: {
      ...DEFAULT_FRIENDS_CONFIG.intro,
      ...(config.intro ?? {}),
    },
    data: normalizeFriendLinks(config.data),
  };
}

function normalizeTimezone(timezone: string | undefined): string {
  const resolvedTimezone = timezone ?? DEFAULT_TIMEZONE;
  if (!isValidTimezone(resolvedTimezone)) {
    throw new Error(`Invalid site.timezone "${resolvedTimezone}". Use a valid IANA timezone identifier.`);
  }
  return resolvedTimezone;
}

/**
 * Memoized by input reference. The imported rawYamlConfig is an ES-module
 * singleton, so the several constants modules that call this normalize it once.
 */
const normalizedConfigCache = new WeakMap<SiteYamlConfig, NormalizedSiteYamlConfig>();

export function normalizeSiteYamlConfig(config: SiteYamlConfig): NormalizedSiteYamlConfig {
  const cached = normalizedConfigCache.get(config);
  if (cached) return cached;

  const normalized = buildNormalizedConfig(config);
  normalizedConfigCache.set(config, normalized);
  return normalized;
}

function buildNormalizedConfig(config: SiteYamlConfig): NormalizedSiteYamlConfig {
  // site is the root of all SEO/links; validate it explicitly (no runtime schema)
  const site: unknown = config.site;
  assertObject(site, 'site');
  requireStringField(site, 'title', 'site');
  requireStringField(site, 'name', 'site');
  requireStringField(site, 'url', 'site');

  const categoryMap = validateCategoryMap(config.categoryMap);
  const featuredCategories = config.featuredCategories ?? [];
  validateFeaturedCategoryLinks(featuredCategories, categoryMap);

  return {
    ...config,
    site: {
      ...config.site,
      timezone: normalizeTimezone(config.site.timezone),
    },
    categoryMap,
    featuredCategories,
    featuredSeries: normalizeFeaturedSeries(config.featuredSeries, categoryMap),
    navigation: config.navigation ?? DEFAULT_NAVIGATION,
    friends: normalizeFriendsConfig(config.friends),
    announcements: config.announcements ?? [],
    content: normalizeContentConfig(config.content),
    comment: config.comment ?? {},
    analytics: config.analytics ?? {},
    seo: config.seo ?? {},
    christmas: normalizeChristmasConfig(config.christmas),
    bgm: normalizeBgmConfig(config.bgm),
    dev: normalizeDevConfig(config.dev),
  };
}
