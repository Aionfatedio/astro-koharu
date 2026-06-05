import { slugify } from 'transliteration';

export function transliterateSlugValue(slug: string, enabled: boolean): string {
  if (!enabled) return slug;
  return slugify(slug, { allowedChars: 'a-zA-Z0-9-_.~/', separator: '-' });
}
