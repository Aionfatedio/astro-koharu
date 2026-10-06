import type { FriendGroup, FriendLink, FriendsConfig } from './types';

export const FRIENDS_DEFAULTS: FriendsConfig = {
  intro: {
    title: 'Friends',
    subtitle: '',
    applyTitle: 'Apply for friend link',
    applyDesc: 'Leave a comment with the following format',
  },
  groups: [],
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
      ...(item.group !== undefined ? { group: requireString(item, 'group', label) } : {}),
    };
  });
}

/** Resolve defaults and validate friend links at the YAML boundary. */
export function normalizeFriendsConfig(
  config: Partial<FriendsConfig> | null | undefined,
): FriendsConfig & { groups: FriendGroup[] } {
  return {
    intro: {
      ...FRIENDS_DEFAULTS.intro,
      ...(config?.intro ?? {}),
    },
    groups: normalizeFriendGroups(config?.groups),
    data: normalizeFriendLinks(config?.data),
  };
}

export interface FriendSection {
  group: FriendGroup | null;
  friends: FriendLink[];
}

export function normalizeFriendGroups(raw: unknown): FriendGroup[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error('Friends configuration error: groups must be an array.');

  const ids = new Set<string>();
  return raw.map((value, index) => {
    if (typeof value !== 'object' || value === null) {
      throw new Error(`Friends configuration error: group at index ${index} must be an object.`);
    }
    const { id, title, description } = value;
    if (typeof id !== 'string' || !id.trim() || typeof title !== 'string' || !title.trim()) {
      throw new Error(`Friends configuration error: group at index ${index} needs a non-empty id and title.`);
    }
    if (description !== undefined && typeof description !== 'string') {
      throw new Error(`Friends configuration error: description of group "${id}" must be a string.`);
    }
    const normalizedId = id.trim();
    if (normalizedId === 'all' || normalizedId === 'ungrouped') {
      throw new Error(`Friends configuration error: group id "${normalizedId}" is reserved.`);
    }
    if (ids.has(normalizedId)) throw new Error(`Friends configuration error: duplicate group id "${normalizedId}".`);
    ids.add(normalizedId);
    return { id: normalizedId, title: title.trim(), ...(description !== undefined ? { description } : {}) };
  });
}

/** Keep missing or unknown group assignments visible instead of dropping links. */
export function groupFriendLinks(friends: readonly FriendLink[], groups: readonly FriendGroup[]): FriendSection[] {
  const sections: FriendSection[] = groups.map((group) => ({ group, friends: [] }));
  const byId = new Map(sections.map((section) => [section.group?.id, section]));
  const ungrouped: FriendSection = { group: null, friends: [] };
  for (const friend of friends) {
    const section = (friend.group ? byId.get(friend.group) : undefined) ?? ungrouped;
    section.friends.push(friend);
  }
  if (ungrouped.friends.length > 0 || sections.length === 0) sections.push(ungrouped);
  return sections;
}
