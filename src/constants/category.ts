import { normalizeSiteYamlConfig } from '@lib/config/normalize';
import rawYamlConfig from '../../config/site.yaml';

// { '随笔': 'life' }
export const categoryMap: { [name: string]: string } = normalizeSiteYamlConfig(rawYamlConfig).categoryMap;
