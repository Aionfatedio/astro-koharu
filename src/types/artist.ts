/** Artist social platform config (same structure as site SocialPlatform) */
export interface ArtistSocial {
  [platform: string]: {
    url: string;
    icon: string;
    color: string;
  };
}

/** Artist profile data loaded from artists.json */
export interface ArtistProfile {
  id: string;
  name: string;
  description: string;
  avatar: string;
  social?: ArtistSocial;
}
