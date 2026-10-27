import { SlashCommandBuilder } from 'discord.js';
import { isAdmin } from '../../lib/discord.js';
import { getActiveTournament } from '../../lib/supabase.js';
import { openRound } from '../../lib/round-manager.js';

export const data = new SlashCommandBuilder()
  .setName('round')
  .setDescription('Round commands')
  .addSubcommand(sub =>
    sub.setName('open')
      .setDescription('Open a round — create match threads (admin only)')
      .addIntegerOption(opt =>
        opt.setName('number').setDescription('Round number (1–5)').setRequired(true).setMinValue(1).setMaxValue(5)
      )
  );

export async function execute(interaction) {
  if (interaction.options.getSubcommand() !== 'open') return;

  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: 'Admin only.', flags: 64 });
  }

  const roundNumber = interaction.options.getInteger('number');
  await interaction.deferReply({ flags: 64 });

  const tournament = await getActiveTournament();
  if (!tournament) return interaction.editReply('No active tournament.');

  const { opened, total } = await openRound(interaction.client, roundNumber, tournament);

  if (opened === 0 && total === 0) {
    return interaction.editReply(`No pending matches in Round ${roundNumber} (or participants not yet assigned).`);
  }
  if (opened === 0) {
    return interaction.editReply(`Thread creation failed for all ${total} matches. Check bot permissions in #match-scheduling.`);
  }

  await interaction.editReply(`Round ${roundNumber} opened. ${opened} threads created.`);
}
