// Import YAML config directly - processed by @rollup/plugin-yaml

import { normalizeSiteYamlConfig } from '@lib/config/normalize';
import type { ContentConfig } from '@lib/config/types';
import rawYamlConfig from '../../config/site.yaml';

// Re-export type for backwards compatibility
export type { ContentConfig };

export const defaultContentConfig: ContentConfig = normalizeSiteYamlConfig(rawYamlConfig).content;
