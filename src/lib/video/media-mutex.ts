import { $activePlayerId } from '@store/player';
import type Artplayer from 'artplayer';

const VIDEO_PLAYER_ID_PREFIX = 'video-artplayer';

let nextVideoPlayerId = 0;

const playerMediaCleanups = new WeakMap<Element, () => void>();
const videoPlayerIds = new WeakMap<Element, string>();

function getVideoPlayerId(container: Element): string {
  const existingId = videoPlayerIds.get(container);
  if (existingId) return existingId;

  nextVideoPlayerId += 1;
  const id = `${VIDEO_PLAYER_ID_PREFIX}-${nextVideoPlayerId}`;
  videoPlayerIds.set(container, id);
  return id;
}

/**
 * Connect Artplayer playback to the site's global audio/video mutex.
 */
export function setupGlobalMediaMutex(container: Element, player: Artplayer): void {
  const playerId = getVideoPlayerId(container);
  let cleaned = false;

  const markActive = () => {
    if (cleaned) return;
    if ($activePlayerId.get() !== playerId) {
      $activePlayerId.set(playerId);
    }
  };

  const clearActive = () => {
    if (cleaned) return;
    if ($activePlayerId.get() === playerId) {
      $activePlayerId.set(null);
    }
  };

  const unsubscribe = $activePlayerId.listen((activeId) => {
    if (cleaned || !activeId || activeId === playerId || !player.playing) return;
    player.pause();
  });

  player.on('video:play', markActive);
  player.on('video:playing', markActive);
  player.on('video:pause', clearActive);
  player.on('video:ended', clearActive);

  const cleanup = () => {
    if (cleaned) return;
    unsubscribe();
    clearActive();
    cleaned = true;
    playerMediaCleanups.delete(container);
  };

  playerMediaCleanups.set(container, cleanup);
  player.on('destroy', cleanup);

  if (player.playing) {
    markActive();
  }
}

export function cleanupGlobalMediaMutex(container: Element): void {
  playerMediaCleanups.get(container)?.();
}
