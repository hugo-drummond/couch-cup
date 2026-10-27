import { SlashCommandBuilder } from 'discord.js';
import { isAdmin, getGuild, assignBracketRole, removeBracketRole, postModLog } from '../lib/discord.js';
import { getBracketParticipants } from '../lib/supabase.js';
import { config } from '../config.js'; // for config.bracketRoleId

export const data = new SlashCommandBuilder()
  .setName('sync')
  .setDescription('Sync @Bracket Player role with Supabase participants (admin only)');

export async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: 'Admin only.', flags: 64 });
  }

  await interaction.deferReply({ flags: 64 });

  const guild        = await getGuild(interaction.client);
  const participants = await getBracketParticipants();

  const bracketIds = new Set(participants.filter(p => p.discord_id).map(p => p.discord_id));

  // Current role holders
  const role           = await guild.roles.fetch(config.bracketRoleId);
  const currentHolders = [...role.members.keys()];

  const added    = [];
  const removed  = [];
  const noDiscord = [];

  for (const p of participants) {
    if (!p.discord_id) { noDiscord.push(p.name); continue; }
    const ok = await assignBracketRole(guild, p.discord_id);
    added.push(ok ? p.name : `${p.name} (not in server)`);
  }

  for (const discordId of currentHolders) {
    if (!bracketIds.has(discordId)) {
      const ok = await removeBracketRole(guild, discordId);
      if (ok) {
        const m = await guild.members.fetch(discordId).catch(() => null);
        removed.push(m?.user.tag ?? discordId);
      }
    }
  }

  const summary = [
    `**Sync complete** at <t:${Math.floor(Date.now() / 1000)}:F>`,
    `✅ Role granted: ${added.length} (${added.join(', ') || 'none'})`,
    `❌ Role removed: ${removed.length} (${removed.join(', ') || 'none'})`,
    `⚠️  No Discord ID: ${noDiscord.length} (${noDiscord.join(', ') || 'none'})`,
  ].join('\n');

  await postModLog(interaction.client, summary);
  await interaction.editReply(summary);
}
