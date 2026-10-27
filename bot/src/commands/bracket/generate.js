import { SlashCommandBuilder } from 'discord.js';
import { isAdmin, postAnnouncement, renderBracketText } from '../../lib/discord.js';
import { getBracketParticipants, getActiveTournament, insertMatches, setTournamentStatus, getMatchesByRound } from '../../lib/supabase.js';
import { generateBracket } from '../../lib/bracket.js';
import { config } from '../../config.js';

export const data = new SlashCommandBuilder()
  .setName('bracket')
  .setDescription('Bracket commands')
  .addSubcommand(sub =>
    sub.setName('generate').setDescription('Generate the R1 bracket from Supabase participants (admin only)')
  );

export async function execute(interaction) {
  if (interaction.options.getSubcommand() !== 'generate') return;

  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: 'Admin only.', flags: 64 });
  }

  await interaction.deferReply({ flags: 64 });

  const tournament = await getActiveTournament();
  if (!tournament) {
    return interaction.editReply('No active tournament found. Create one in Supabase first.');
  }

  const participants = await getBracketParticipants();
  const n = participants.length;
  const isPowerOf2 = n >= 4 && (n & (n - 1)) === 0;

  if (config.isTestMode) {
    if (!isPowerOf2 || n > 32) {
      return interaction.editReply(`Test mode requires 4, 8, 16, or 32 bracket participants. Found ${n}.`);
    }
  } else {
    if (n !== 32) {
      return interaction.editReply(`Need exactly 32 bracket participants. Found ${n}. Adjust statuses in Supabase and try again.`);
    }
  }

  const matches = generateBracket(tournament.id, participants);
  await insertMatches(matches);
  await setTournamentStatus(tournament.id, 'active');

  // Fetch R1 matches with participant names for display
  const r1Matches = await getMatchesByRound(tournament.id, 1);
  const totalRounds = Math.log2(n);

  const bracketText = renderBracketText(r1Matches, totalRounds);

  await postAnnouncement(interaction.client, [
    `# 🏆 ${tournament.name}: Bracket Drawn!`,
    ``,
    `The bracket is set. **${participants.length} players** compete in a single-elimination tournament.`,
    ``,
    bracketText,
    ``,
    `Round 1 threads will open shortly. Stay tuned!`,
  ].join('\n'));

  await interaction.editReply(`Bracket generated. ${matches.length} match slots created. Announcement posted.`);
}
