import fs from 'node:fs/promises';
import YAML from 'yaml';
import type { BgmAudioGroup, SiteYamlConfig } from '../../lib/config/types';

async function readSiteYaml(): Promise<Partial<SiteYamlConfig>> {
  const content = await fs.readFile('config/site.yaml', 'utf8');
  return YAML.parse(content) as Partial<SiteYamlConfig>;
}

export async function readSlugTransliterationEnabled(): Promise<boolean> {
  const config = await readSiteYaml();
  return config.site?.enableSlugTransliteration === true;
}

export async function readBgmAudioGroups(): Promise<BgmAudioGroup[]> {
  const config = await readSiteYaml();
  if (config.bgm?.enabled === false || !Array.isArray(config.bgm?.audio)) return [];
  return config.bgm.audio.filter((group): group is BgmAudioGroup => Array.isArray(group?.list));
}
