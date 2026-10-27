import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { getMatchByThreadId, getParticipantByDiscordId, insertScoreReport, getScoreReports, updateMatch, advanceWinner, getActiveTournament, updateParticipantStatus } from '../lib/supabase.js';
import { postAnnouncement, postModLog } from '../lib/discord.js';
import { roundName } from '../lib/bracket.js';

export const data = new SlashCommandBuilder()
  .setName('score')
  .setDescription('Submit your match result (use inside your match thread)');

export async function execute(interaction) {
  // Must be used inside a thread
  if (!interaction.channel.isThread()) {
    return interaction.reply({ content: 'Use `/score` inside your match thread.', flags: 64 });
  }

  const match = await getMatchByThreadId(interaction.channelId);
  if (!match) {
    return interaction.reply({ content: 'This thread is not linked to an active match.', flags: 64 });
  }
  if (match.status !== 'active') {
    return interaction.reply({ content: 'This match is not currently active.', flags: 64 });
  }

  const reporter = await getParticipantByDiscordId(interaction.user.id);
  if (!reporter) {
    return interaction.reply({ content: "Couldn't find your participant record. Contact an admin.", flags: 64 });
  }

  const isPlayerA = reporter.id === match.participant_a_id;
  const isPlayerB = reporter.id === match.participant_b_id;
  if (!isPlayerA && !isPlayerB) {
    return interaction.reply({ content: "You're not a participant in this match.", flags: 64 });
  }

  // Check if already reported
  if ((isPlayerA && match.reported_by_a) || (isPlayerB && match.reported_by_b)) {
    return interaction.reply({ content: 'You already submitted a result for this match.', flags: 64 });
  }

  const modal = new ModalBuilder()
    .setCustomId(`score_modal:${match.id}`)
    .setTitle('Submit Match Result');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('winner_psn')
        .setLabel("Winner's PSN ID")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('PSN_Username')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('your_score')
        .setLabel('Your goals')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. 3')
        .setRequired(true)
        .setMaxLength(2)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('opponent_score')
        .setLabel("Opponent's goals")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. 1')
        .setRequired(true)
        .setMaxLength(2)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('stream_url')
        .setLabel('Your stream URL')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://...')
        .setRequired(false)
    )
  );

  await interaction.showModal(modal);
}

// Called from the modal submit handler in index.js
export async function handleScoreModal(interaction) {
  const matchId = interaction.customId.split(':')[1];
  await interaction.deferReply({ flags: 64 });

  const match = await getMatchByThreadId(interaction.channelId);
  if (!match || match.id !== matchId) {
    return interaction.editReply('Match not found.');
  }

  const reporter = await getParticipantByDiscordId(interaction.user.id);
  if (!reporter) return interaction.editReply('Reporter not found.');

  const winnerPsn   = interaction.fields.getTextInputValue('winner_psn').trim();
  const yourScore   = parseInt(interaction.fields.getTextInputValue('your_score'));
  const oppScore    = parseInt(interaction.fields.getTextInputValue('opponent_score'));
  const streamUrl   = interaction.fields.getTextInputValue('stream_url').trim() || null;

  if (isNaN(yourScore) || isNaN(oppScore)) {
    return interaction.editReply('Scores must be numbers.');
  }

  const isPlayerA = reporter.id === match.participant_a_id;
  const scoreA = isPlayerA ? yourScore : oppScore;
  const scoreB = isPlayerA ? oppScore : yourScore;

  // Determine claimed winner
  const claimedWinner = winnerPsn.toLowerCase() === match.participant_a.psn_id.toLowerCase()
    ? match.participant_a_id
    : winnerPsn.toLowerCase() === match.participant_b.psn_id.toLowerCase()
      ? match.participant_b_id
      : null;

  if (!claimedWinner) {
    return interaction.editReply(`PSN "${winnerPsn}" doesn't match either player. Check the spelling and try again.`);
  }

  await insertScoreReport({
    bracket_id:    match.id,
    reporter_id:   reporter.id,
    claimed_winner: claimedWinner,
    score_reporter: yourScore,
    score_opponent: oppScore,
    stream_url:    streamUrl,
  });

  await updateMatch(match.id, {
    ...(isPlayerA ? { reported_by_a: true, stream_url_a: streamUrl } : { reported_by_b: true, stream_url_b: streamUrl }),
  });

  // Check if both have reported
  const updatedA = isPlayerA ? true : match.reported_by_a;
  const updatedB = isPlayerA ? match.reported_by_b : true;

  if (!updatedA || !updatedB) {
    await interaction.editReply('Result recorded. Waiting for your opponent to submit theirs.');
    await interaction.channel.send(`✅ **${reporter.name}** has submitted their result. Waiting for the other player.`);
    return;
  }

  // Both reported — compare
  const reports = await getScoreReports(match.id);
  const [r1, r2] = reports.slice(-2);

  const scoresMatch = r1.claimed_winner === r2.claimed_winner;

  if (!scoresMatch) {
    await updateMatch(match.id, { dispute_flag: true });
    await postModLog(interaction.client,
      `⚠️ **Dispute** in match thread <#${match.discord_thread_id}>\n` +
      `${match.participant_a.name} vs ${match.participant_b.name}\n` +
      `Reports disagree on winner. Admin review required.`
    );
    await interaction.channel.send(
      `⚠️ **Score reports don't match.** An admin has been notified to review. Do not play again until instructed.`
    );
    await interaction.editReply('Dispute flagged. Admins notified.');
    return;
  }

  // Agreed winner — advance
  const winnerId = r1.claimed_winner;
  await advanceWinner(match, winnerId);

  const winner = winnerId === match.participant_a_id ? match.participant_a : match.participant_b;
  const loser  = winnerId === match.participant_a_id ? match.participant_b : match.participant_a;

  await updateParticipantStatus(loser.id, 'eliminated');

  // Check if this was the final (round 5)
  const tournament = await getActiveTournament();
  if (match.round_number === 5) {
    await updateParticipantStatus(winner.id, 'winner');
    if (tournament) {
      const { setTournamentStatus } = await import('../lib/supabase.js');
      await setTournamentStatus(tournament.id, 'completed');
    }
    await postAnnouncement(interaction.client, [
      `# 🏆 WE HAVE A CHAMPION!`,
      ``,
      `Congratulations to **${winner.name}** (${winner.psn_id}): the Couch Cup EA FC 26 champion!`,
      ``,
      `Thank you to all 32 players who competed. See you next season! 🎮`,
    ].join('\n'));
  } else {
    await postAnnouncement(interaction.client, [
      `## ✅ ${roundName(match.round_number)} Result`,
      `**${winner.name}** defeats **${loser.name}** and advances! 🎮`,
      ...(streamUrl ? [`📺 Stream: ${streamUrl}`] : []),
    ].join('\n'));
  }

  await interaction.editReply('Result confirmed. Winner advanced.');
  await interaction.channel.send(
    `✅ **Match complete!** ${winner.name} advances. This thread is now closed.`
  );
}
