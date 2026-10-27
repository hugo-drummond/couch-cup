import { SlashCommandBuilder } from 'discord.js';
import { isAdmin, postAnnouncement } from '../../lib/discord.js';
import { checkRoundCompletion } from '../../lib/round-manager.js';
import { getMatchByThreadId, getParticipantByPsn, advanceWinner, updateMatch, updateParticipantStatus, getActiveTournament, setTournamentStatus, getThreadIdsForTournament, resetTournament, getMatchById, getAdminReview, updateAdminReview, banPlayer, supabase } from '../../lib/supabase.js';
import { roundName } from '../../lib/bracket.js';

export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Admin commands')
  .addSubcommand(sub =>
    sub.setName('force-result')
      .setDescription('Force a match result (dispute/no-show override)')
      .addStringOption(opt =>
        opt.setName('winner_psn').setDescription("Winner's PSN ID").setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName('notes').setDescription('Reason for override').setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub.setName('forfeit')
      .setDescription('Forfeit a player — opponent advances')
      .addStringOption(opt =>
        opt.setName('forfeiting_psn').setDescription("Forfeiting player's PSN ID").setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName('notes').setDescription('Reason').setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub.setName('order-replay')
      .setDescription('Order a match replay')
      .addStringOption(opt =>
        opt.setName('notes').setDescription('Reason for replay').setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub.setName('override-match')
      .setDescription('Manually set match winner for disputed scores')
      .addStringOption(opt => opt.setName('match_id').setDescription('Match ID').setRequired(true))
      .addStringOption(opt => opt.setName('winner_psn').setDescription("Winner's PSN ID").setRequired(true))
      .addStringOption(opt => opt.setName('notes').setDescription('Reason').setRequired(false))
  )
  .addSubcommand(sub =>
    sub.setName('review-forfeit')
      .setDescription('Act on a forfeit appeal')
      .addStringOption(opt => opt.setName('match_id').setDescription('Match ID').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('clear-flag')
      .setDescription('Clear two-strike flag and reset forfeit_advances')
      .addStringOption(opt => opt.setName('participant_id').setDescription('Participant ID').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('disqualify')
      .setDescription('Remove a player from the bracket')
      .addStringOption(opt => opt.setName('participant_id').setDescription('Discord ID, PSN ID, or UUID').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason (optional)').setRequired(false))
  )
  .addSubcommand(sub =>
    sub.setName('ban-cheater')
      .setDescription('Add a player to the cheaters list')
      .addStringOption(opt => opt.setName('discord_id').setDescription('Discord user ID').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason for ban').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('player-history')
      .setDescription("View a player's full match history")
      .addStringOption(opt => opt.setName('participant_id').setDescription('Participant ID').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('reset')
      .setDescription('Reset the tournament: delete all threads, brackets, and scores (TEST MODE only)')
  );

// Resolve participant by UUID, Discord ID, or PSN ID
async function resolveParticipant(input) {
  if (!input) return null;
  // Try UUID first
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(input)) {
    const { data } = await supabase.from('participants').select('*').eq('id', input).single();
    return data ?? null;
  }
  // Try Discord ID (numeric string)
  if (/^\d{15,20}$/.test(input)) {
    const { data } = await supabase.from('participants').select('*').eq('discord_id', input).single();
    return data ?? null;
  }
  // Try PSN ID
  const { data } = await supabase.from('participants').select('*').ilike('psn_id', input).single();
  return data ?? null;
}

export async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: 'Admin only.', flags: 64 });
  }

  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ flags: 64 });

  if (sub === 'override-match') {
    const matchId   = interaction.options.getString('match_id');
    const winnerPsn = interaction.options.getString('winner_psn');
    const notes     = interaction.options.getString('notes') ?? '';
    const match = await getMatchById(matchId);
    if (!match) return interaction.editReply(`Match ${matchId} not found.`);
    const winner = await getParticipantByPsn(winnerPsn);
    if (!winner) return interaction.editReply(`PSN "${winnerPsn}" not found.`);
    if (![match.participant_a_id, match.participant_b_id].includes(winner.id)) {
      return interaction.editReply('That PSN is not in this match.');
    }
    const loser = winner.id === match.participant_a_id ? match.participant_b : match.participant_a;
    await advanceWinner(match, winner.id);
    await updateMatch(match.id, { admin_override: true, dispute_flag: false, dispute_status: 'resolved', notes });
    await updateParticipantStatus(loser.id, 'eliminated');
    checkRoundCompletion(interaction.client, match).catch(() => {});
    return interaction.editReply(`Done. **${winner.name}** wins by admin decision.${notes ? ` Note: ${notes}` : ''}`);
  }

  if (sub === 'review-forfeit') {
    const matchId = interaction.options.getString('match_id');
    const review  = await getAdminReview(matchId);
    const match   = await getMatchById(matchId);
    if (!match) return interaction.editReply(`Match ${matchId} not found.`);

    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
    return interaction.editReply({
      content: [
        `**Appeal Review: Match ${matchId}**`,
        `Players: ${match.participant_a?.name} vs ${match.participant_b?.name} (R${match.round_number})`,
        review ? `Reason: ${review.reason_text}` : 'No appeal reason recorded.',
        ``,
        `Choose an action:`,
      ].join('\n'),
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`adm_restore_both:${matchId}`).setLabel('Restore both + extend window').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`adm_confirm_forfeit:${matchId}`).setLabel('Confirm forfeit + cascade').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`adm_reject_appeal:${matchId}`).setLabel('Reject as frivolous + DQ requester').setStyle(ButtonStyle.Danger),
        ),
      ],
    });
  }

  if (sub === 'clear-flag') {
    const p = await resolveParticipant(interaction.options.getString('participant_id'));
    if (!p) return interaction.editReply('Participant not found. Pass a Discord ID, PSN ID, or participant UUID.');
    await supabase.from('participants').update({ flagged_for_review: false, forfeit_advances: 0 }).eq('id', p.id);
    return interaction.editReply(`Flag cleared for **${p.name}**.`);
  }

  if (sub === 'disqualify') {
    const p      = await resolveParticipant(interaction.options.getString('participant_id'));
    const reason = interaction.options.getString('reason') ?? 'Admin decision';
    if (!p) return interaction.editReply('Participant not found. Pass a Discord ID, PSN ID, or participant UUID.');
    await updateParticipantStatus(p.id, 'eliminated');
    await supabase.from('participants').update({ flagged_for_review: false }).eq('id', p.id);
    return interaction.editReply(`**${p.name}** disqualified. Reason: ${reason}.`);
  }

  if (sub === 'ban-cheater') {
    const discordId = interaction.options.getString('discord_id');
    const reason    = interaction.options.getString('reason');
    const tournament = await getActiveTournament();
    let displayName = discordId;
    try {
      const user = await interaction.client.users.fetch(discordId);
      displayName = user.username;
    } catch { /* user not found */ }
    await banPlayer(discordId, displayName, tournament?.id, reason);
    return interaction.editReply(`**${displayName}** has been added to the cheaters list. They will be blocked from future tournament syncs.`);
  }

  if (sub === 'player-history') {
    const p = await resolveParticipant(interaction.options.getString('participant_id'));
    if (!p) return interaction.editReply('Participant not found.');
    const participantId = p.id;
    const { data: matches } = await supabase
      .from('brackets')
      .select('round_number, status, forfeit_reason, score_a, score_b, winner_id, participant_a_id, participant_b_id')
      .or(`participant_a_id.eq.${participantId},participant_b_id.eq.${participantId}`)
      .order('round_number');
    if (!matches?.length) return interaction.editReply('No match history found.');
    const lines = matches.map(m => {
      const isA = m.participant_a_id === participantId;
      const myScore  = isA ? m.score_a : m.score_b;
      const oppScore = isA ? m.score_b : m.score_a;
      const won = m.winner_id === participantId;
      const score = myScore != null ? `${myScore}-${oppScore}` : 'N/A';
      const result = m.forfeit_reason ? `Forfeit (${m.forfeit_reason})` : (won ? `W ${score}` : `L ${score}`);
      return `R${m.round_number}: ${result} | Status: ${m.status}`;
    });
    return interaction.editReply(`**Match history for ${participantId}:**\n${lines.join('\n')}`);
  }

  if (sub === 'reset') {
    const { config } = await import('../../config.js');
    if (!config.isTestMode) {
      return interaction.editReply('Reset is only available in test mode.');
    }
    const tournament = await getActiveTournament();
    if (!tournament) return interaction.editReply('No active tournament found.');

    const threadIds = await getThreadIdsForTournament(tournament.id);
    let deleted = 0;
    for (const id of threadIds) {
      try {
        await interaction.client.channels.fetch(id).then(ch => ch?.delete());
        deleted++;
      } catch { /* thread may already be gone */ }
    }

    await resetTournament(tournament.id);
    return interaction.editReply(`Reset complete. ${deleted}/${threadIds.length} threads deleted. Tournament reset to pending.`);
  }

  if (!interaction.channel.isThread()) {
    return interaction.reply({ content: 'Use this command inside the match thread.', flags: 64 });
  }

  const match = await getMatchByThreadId(interaction.channelId);
  if (!match) return interaction.editReply('Thread not linked to a match.');

  if (sub === 'order-replay') {
    const notes = interaction.options.getString('notes') ?? '';
    await updateMatch(match.id, { replay_ordered: true, notes });
    await interaction.channel.send(
      `🔄 **Replay ordered by admin.** Both players must replay this match. Reset your results and play again, then both submit via \`/score\`.\n${notes ? `Reason: ${notes}` : ''}`
    );
    return interaction.editReply('Replay ordered.');
  }

  const psnInput = sub === 'forfeit'
    ? interaction.options.getString('forfeiting_psn')
    : interaction.options.getString('winner_psn');

  const notes = interaction.options.getString('notes') ?? '';

  const psnParticipant = await getParticipantByPsn(psnInput);
  if (!psnParticipant) return interaction.editReply(`PSN "${psnInput}" not found.`);

  let winnerId, loserId;

  if (sub === 'forfeit') {
    // Forfeiting player loses — the OTHER player wins
    if (psnParticipant.id === match.participant_a_id) {
      winnerId = match.participant_b_id;
      loserId  = match.participant_a_id;
    } else if (psnParticipant.id === match.participant_b_id) {
      winnerId = match.participant_a_id;
      loserId  = match.participant_b_id;
    } else {
      return interaction.editReply('That PSN is not a participant in this match.');
    }
  } else {
    // force-result: named player wins
    if (![match.participant_a_id, match.participant_b_id].includes(psnParticipant.id)) {
      return interaction.editReply('That PSN is not a participant in this match.');
    }
    winnerId = psnParticipant.id;
    loserId  = winnerId === match.participant_a_id ? match.participant_b_id : match.participant_a_id;
  }

  await advanceWinner(match, winnerId);
  await updateMatch(match.id, { admin_override: true, dispute_flag: false, notes });

  const winner = winnerId === match.participant_a_id ? match.participant_a : match.participant_b;
  const loser  = loserId  === match.participant_a_id ? match.participant_a : match.participant_b;

  await updateParticipantStatus(loser.id, 'eliminated');

  // Final check
  const tournament = await getActiveTournament();
  if (match.round_number === 5) {
    await updateParticipantStatus(winner.id, 'winner');
    if (tournament) await setTournamentStatus(tournament.id, 'completed');
    await postAnnouncement(interaction.client, [
      `# 🏆 WE HAVE A CHAMPION!`,
      `**${winner.name}** wins the Couch Cup EA FC 26 tournament!`,
      notes ? `\n_Admin note: ${notes}_` : '',
    ].join('\n'));
  } else {
    const label = sub === 'forfeit' ? `**${loser.name}** forfeited.` : 'Admin override.';
    await postAnnouncement(interaction.client, [
      `## ${roundName(match.round_number)} Result (Admin)`,
      `**${winner.name}** advances. ${label}`,
      notes ? `_${notes}_` : '',
    ].join('\n'));
  }

  await interaction.channel.send(`✅ Admin result recorded. **${winner.name}** advances.${notes ? `\nNote: ${notes}` : ''}`);
  await interaction.editReply('Done.');
}
