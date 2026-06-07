// Import YAML config directly - processed by @rollup/plugin-yaml

import { normalizeSiteYamlConfig } from '@lib/config/normalize';
import type { FriendLink, FriendsIntro } from '@lib/config/types';
import rawYamlConfig from '../../config/site.yaml';

const yamlConfig = normalizeSiteYamlConfig(rawYamlConfig);

// Re-export type for backwards compatibility
export type { FriendLink };

export const friendsData: FriendLink[] = yamlConfig.friends.data;

export const friendsIntro: FriendsIntro = yamlConfig.friends.intro;
