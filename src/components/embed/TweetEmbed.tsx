/**
 * Tweet embed component using react-tweet
 * Provides a lightweight, theme-aware Twitter/X embed
 */

import { useIsDarkTheme } from '@hooks/index';
import { useEffect, useState } from 'react';
import { EmbeddedTweet, TweetNotFound, useTweet } from 'react-tweet';
import type { QuotedTweet, Tweet, TweetEntities } from 'react-tweet/api';

interface TweetEmbedProps {
  tweetId: string;
}

function normalizeTweetEntities(entities: TweetEntities | undefined): TweetEntities {
  return {
    hashtags: Array.isArray(entities?.hashtags) ? entities.hashtags : [],
    urls: Array.isArray(entities?.urls) ? entities.urls : [],
    user_mentions: Array.isArray(entities?.user_mentions) ? entities.user_mentions : [],
    symbols: Array.isArray(entities?.symbols) ? entities.symbols : [],
    ...(Array.isArray(entities?.media) && { media: entities.media }),
  };
}

function normalizeTweet(tweet: Tweet): Tweet {
  return {
    ...tweet,
    entities: normalizeTweetEntities(tweet.entities),
    ...(tweet.quoted_tweet && {
      quoted_tweet: {
        ...tweet.quoted_tweet,
        entities: normalizeTweetEntities((tweet.quoted_tweet as QuotedTweet).entities),
      },
    }),
  };
}

function TweetEmbed({ tweetId }: TweetEmbedProps) {
  const [mounted, setMounted] = useState(false);
  const isDark = useIsDarkTheme();
  const { data, error, isLoading } = useTweet(tweetId);

  useEffect(() => {
    setMounted(true);
  }, []);

  const theme = isDark ? 'dark' : 'light';

  if (!mounted || isLoading) {
    return (
      <output className="my-6 flex justify-center" aria-busy="true" aria-label="正在加载 Tweet">
        <div className="w-full max-w-[550px] animate-pulse rounded-xl bg-muted/50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-12 w-12 rounded-full bg-muted"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 rounded bg-muted"></div>
              <div className="h-3 w-24 rounded bg-muted"></div>
            </div>
          </div>
          <div className="mt-4 h-20 rounded bg-muted"></div>
        </div>
      </output>
    );
  }

  if (error || !data) {
    return (
      <div className="not-prose my-6 flex justify-center" data-theme={theme}>
        <TweetNotFound error={error} />
      </div>
    );
  }

  return (
    <div className="not-prose my-6 flex justify-center" data-theme={theme}>
      <EmbeddedTweet tweet={normalizeTweet(data)} />
    </div>
  );
}

export default TweetEmbed;
