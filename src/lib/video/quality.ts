/**
 * Get quality label based on video resolution.
 */
export function getQualityLabel(width: number, height: number): string {
  const maxDimension = Math.max(width, height);
  const minDimension = Math.min(width, height);

  if (maxDimension >= 3840 || minDimension >= 2160) {
    return '4K UHD';
  }
  if (maxDimension >= 2560 || minDimension >= 1440) {
    return '2K FHD';
  }
  if (maxDimension >= 1920 || minDimension >= 1080) {
    return '1080P HD';
  }
  if (maxDimension >= 1280 || minDimension >= 720) {
    return '720P HD';
  }
  if (maxDimension >= 854 || minDimension >= 480) {
    return '480P SD';
  }
  if (maxDimension >= 640 || minDimension >= 360) {
    return '360P';
  }
  return 'Quality';
}
