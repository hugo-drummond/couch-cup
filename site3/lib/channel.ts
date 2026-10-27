export type ChannelPlatform = 'youtube' | 'twitch' | 'unknown'

// A single column (players.youtube_url) holds either a YouTube or Twitch link,
// so the platform is derived from the URL rather than stored separately.
export function detectPlatform(url: string | null | undefined): ChannelPlatform {
  if (!url) return 'unknown'
  const u = url.toLowerCase()
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube'
  if (u.includes('twitch.tv')) return 'twitch'
  return 'unknown'
}

export function channelLabel(url: string | null | undefined): string {
  switch (detectPlatform(url)) {
    case 'youtube':
      return 'YouTube'
    case 'twitch':
      return 'Twitch'
    default:
      return 'Channel'
  }
}
