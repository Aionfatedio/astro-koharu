import fs from 'node:fs/promises';
import YAML from 'yaml';

interface SiteYamlConfig {
  site?: {
    enableSlugTransliteration?: boolean;
  };
}

export async function readSlugTransliterationEnabled(): Promise<boolean> {
  const content = await fs.readFile('config/site.yaml', 'utf8');
  const config = YAML.parse(content) as SiteYamlConfig;
  return config.site?.enableSlugTransliteration === true;
}
