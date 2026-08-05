import type { FriendLink, FriendsConfig } from './types';

export const FRIENDS_DEFAULTS: FriendsConfig = {
  intro: {
    title: 'Friends',
    subtitle: '',
    applyTitle: 'Apply for friend link',
    applyDesc: 'Leave a comment with the following format',
  },
  data: [],
};

function requireObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new TypeError(`${label} must be an object.`);
}

function requireString(value: Record<string, unknown>, field: string, label: string): string {
  const fieldValue = value[field];
  if (typeof fieldValue !== 'string' || !fieldValue.trim()) {
    throw new TypeError(`${label}.${field} must be a non-empty string.`);
  }
  return fieldValue;
}

function normalizeFriendLinks(value: unknown): FriendLink[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new TypeError('friends.data must be an array.');

  return value.map((item, index) => {
    const label = `friends.data[${index}]`;
    requireObject(item, label);
    const color = item.color;
    if (color !== undefined && (typeof color !== 'string' || !color.trim())) {
      throw new TypeError(`${label}.color must be a non-empty string when provided.`);
    }

    return {
      site: requireString(item, 'site', label),
      url: requireString(item, 'url', label),
      owner: requireString(item, 'owner', label),
      desc: requireString(item, 'desc', label),
      image: requireString(item, 'image', label),
      ...(typeof color === 'string' ? { color } : {}),
    };
  });
}

/** Resolve defaults and validate friend links at the YAML boundary. */
export function normalizeFriendsConfig(config: Partial<FriendsConfig> | null | undefined): FriendsConfig {
  return {
    intro: {
      ...FRIENDS_DEFAULTS.intro,
      ...(config?.intro ?? {}),
    },
    data: normalizeFriendLinks(config?.data),
  };
}
