import artistsData from '@/data/artists.json';
import type { ArtistProfile } from '@/types/artist';

const artistMap = new Map<string, ArtistProfile>((artistsData as ArtistProfile[]).map((a) => [a.id, a]));

/** Look up artist by ID. Returns null if not found. */
export function getArtistById(id: string): ArtistProfile | null {
  return artistMap.get(id) ?? null;
}
