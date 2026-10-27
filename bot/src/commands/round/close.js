import { SlashCommandBuilder } from 'discord.js';
import { isAdmin, postAnnouncement, renderBracketText } from '../../lib/discord.js';
import { getActiveTournament, getMatchesByRound, insertMatches } from '../../lib/supabase.js';
import { roundName } from '../../lib/bracket.js';

export const data = new SlashCommandBuilder()
  .setName('round-close')
  .setDescription('Close a round and generate next-round matches (admin only)')
  .addIntegerOption(opt =>
    opt.setName('number').setDescription('Round number to close').setRequired(true).setMinValue(1).setMaxValue(5)
  );

export async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: 'Admin only.', flags: 64 });
  }

  const roundNumber = interaction.options.getInteger('number');
  await interaction.deferReply({ flags: 64 });

  const tournament = await getActiveTournament();
  if (!tournament) return interaction.editReply('No active tournament.');

  const matches = await getMatchesByRound(tournament.id, roundNumber);
  const incomplete = matches.filter(m => m.status !== 'completed' && m.status !== 'bye');

  if (incomplete.length > 0) {
    const names = incomplete.map(m => `${m.participant_a?.name ?? '?'} vs ${m.participant_b?.name ?? '?'}`);
    return interaction.editReply(
      `Cannot close Round ${roundNumber}: ${incomplete.length} match(es) still pending:\n${names.join('\n')}`
    );
  }

  // If this was the final, crown the winner (handled separately by score flow but guard here too)
  if (roundNumber === 5) {
    return interaction.editReply('Round 5 is the Final. The winner should have been crowned automatically.');
  }

  // Fetch next round to show updated bracket
  const nextRound = await getMatchesByRound(tournament.id, roundNumber + 1);
  const bracketText = renderBracketText(nextRound);

  await postAnnouncement(interaction.client, [
    `## ✅ ${roundName(roundNumber)} Complete!`,
    ``,
    `All matches are in. Here's the ${roundName(roundNumber + 1)} draw:`,
    ``,
    bracketText,
    ``,
    `Use \`/round open ${roundNumber + 1}\` to open the next round.`,
  ].join('\n'));

  await interaction.editReply(`Round ${roundNumber} closed. Next-round bracket posted.`);
}
