import 'dotenv/config';

const dev = process.env.NODE_ENV === 'development';
export const TEST_MODE = process.env.TEST_MODE === 'true';

export const config = {
  isDev: dev,
  isTestMode: TEST_MODE,

  guildId:              dev ? process.env.DEV_GUILD_ID              : process.env.DISCORD_GUILD_ID,
  announcementsChannel: dev ? process.env.DEV_ANNOUNCEMENTS_CHANNEL_ID  : process.env.ANNOUNCEMENTS_CHANNEL_ID,
  matchChannel:         dev ? process.env.DEV_MATCH_SCHEDULING_CHANNEL_ID : process.env.MATCH_SCHEDULING_CHANNEL_ID,
  modLogChannel:        dev ? process.env.DEV_MOD_LOG_CHANNEL_ID     : process.env.MOD_LOG_CHANNEL_ID,
  adminRoleId:          dev ? process.env.DEV_ADMIN_ROLE_ID          : process.env.COUCH_CUP_ADMIN_ROLE_ID,
  bracketRoleId:        dev ? process.env.DEV_BRACKET_PLAYER_ROLE_ID : process.env.BRACKET_PLAYER_ROLE_ID,
  veteranRoleId:        dev ? process.env.DEV_VETERAN_ROLE_ID        : process.env.VETERAN_ROLE_ID,
  tournamentDirectorId: process.env.TOURNAMENT_DIRECTOR_DISCORD_ID,

  // Match window: 3 minutes in test mode, 48 hours in production
  matchWindowMs: TEST_MODE ? 3 * 60 * 1000 : 48 * 60 * 60 * 1000,
  matchWindowLabel: TEST_MODE ? '3 minutes' : '48 hours',
  // Proposal cutoff: 30 seconds before close in test, 15 minutes in production
  proposalCutoffMs: TEST_MODE ? 30 * 1000 : 15 * 60 * 1000,
  // Score submission window: 1 minute in test mode, 2 hours in production
  scoreWindowMs: TEST_MODE ? 1 * 60 * 1000 : 2 * 60 * 60 * 1000,
  scoreWindowLabel: TEST_MODE ? '1 minute' : '2 hours',
};

export function logUserError(msg, err) {
  if (TEST_MODE) {
    console.warn(`[TEST_MODE] ${msg}`, err?.message ?? '');
  } else {
    throw err ?? new Error(msg);
  }
}
