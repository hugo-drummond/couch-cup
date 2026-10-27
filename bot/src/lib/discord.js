import { PermissionFlagsBits } from 'discord.js';
import 'dotenv/config';
import { config } from '../config.js';

// ── Auth ──────────────────────────────────────────────────────

export function isAdmin(member) {
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.roles.cache.has(config.adminRoleId)
  );
}

// ── Guild / channel helpers ───────────────────────────────────

export async function getGuild(client) {
  return client.guilds.fetch(config.guildId);
}

export async function postAnnouncement(client, content) {
  const ch = await client.channels.fetch(config.announcementsChannel);
  return ch.send(content);
}

export async function postModLog(client, content) {
  const ch = await client.channels.fetch(config.modLogChannel);
  return ch.send(content);
}

// ── Role helpers ──────────────────────────────────────────────

async function toggleRole(guild, discordId, roleId, action) {
  try {
    const member = await guild.members.fetch(discordId);
    await member.roles[action](roleId);
    return true;
  } catch (err) {
    console.warn(`[toggleRole] failed for ${discordId} (${action} role ${roleId}):`, err.message);
    return false;
  }
}

export const assignBracketRole = (guild, id) => toggleRole(guild, id, config.bracketRoleId, 'add');
export const removeBracketRole = (guild, id) => toggleRole(guild, id, config.bracketRoleId, 'remove');
export const assignVeteranRole = (guild, id) => toggleRole(guild, id, config.veteranRoleId, 'add');

// ── Match thread ──────────────────────────────────────────────

export async function createMatchThread(client, match, roundNumber) {
  const ch = await client.channels.fetch(config.matchChannel);
  const pA = match.participant_a;
  const pB = match.participant_b;

  const thread = await ch.threads.create({
    name: `R${roundNumber}: ${pA.name} vs ${pB.name}`,
    type: 11, // PublicThread — channel is already Bracket Player only
  });

  const add = async (discordId) => {
    if (!discordId) return;
    try { await thread.members.add(discordId); } catch { /* not in server */ }
  };

  await add(pA.discord_id);
  await add(pB.discord_id);
  await add(config.tournamentDirectorId);

  const mention = (p) => p.discord_id
    ? `<@${p.discord_id}>`
    : `**${p.psn_id}** *(no Discord: admin will coordinate via email)*`;

  const deadline   = new Date(Date.now() + config.matchWindowMs);
  const deadlineTs = `<t:${Math.floor(deadline.getTime() / 1000)}:F>`;
  const tdMention  = config.tournamentDirectorId ? `<@${config.tournamentDirectorId}>` : 'the Tournament Director';

  const msg = await thread.send([
    `## 🎮 Couch Cup: EA FC 26 - R${roundNumber} Match`,
    ``,
    `Welcome ${mention(pA)} and ${mention(pB)}!`,
    `This thread is only visible to players in this tournament.`,
    ``,
    `📅 **Deadline:** ${deadlineTs}`,
    `⚠️ Both players must stream the match live. Submit your stream URL via \`/score\` when you report your result.`,
    `🎯 **Settings:** 6-min halves · Normal speed · Default in-game settings · Online Friendlies · PS5`,
    ``,
    `Use this thread to agree on a time that works for both of you.`,
    `When done, **both** players submit via \`/score\` within 30 minutes of full-time.`,
    ``,
    `Questions? Tag ${tdMention} (Tournament Director).`,
    ``,
    `Good luck! 🏆`,
  ].join('\n'));

  return thread;
}

// ── Bracket text renderer ─────────────────────────────────────

export function renderBracketText(allMatches, totalRounds) {
  const rounds = [...new Set(allMatches.map(m => m.round_number))].sort((a, b) => a - b);
  const maxRound = totalRounds ?? Math.max(...rounds);
  const roundNames = (r) => {
    if (r === maxRound)                            return 'Grand Final';
    if (r === maxRound - 1 && maxRound > 2)        return 'Semi-Finals';
    if (r === maxRound - 2 && maxRound > 3)        return 'Quarter-Finals';
    return `Round ${r}`;
  };

  const lines = ['```'];
  for (const r of rounds) {
    lines.push(`── ${roundNames(r)} ──`);
    const matches = allMatches.filter(m => m.round_number === r).sort((a, b) => a.position - b.position);
    for (const m of matches) {
      const a      = m.participant_a?.name ?? 'TBD';
      const b      = m.participant_b?.name ?? 'TBD';
      const result = m.winner?.name
        ? ` → ${m.winner.name}`
        : (m.score_a != null ? ` [${m.score_a}–${m.score_b}]` : '');
      lines.push(`  [${String(m.position).padStart(2)}] ${a} vs ${b}${result}`);
    }
    lines.push('');
  }
  lines.push('```');
  return lines.join('\n');
}
