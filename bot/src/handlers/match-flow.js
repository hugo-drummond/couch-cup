import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import {
  getMatchByThreadId, setMatchScheduling, updateMatch,
  advanceWinner, updateParticipantStatus, getActiveTournament, setTournamentStatus,
  insertScoreReport, incrementForfeitAdvances, createAdminReview, isBanned, getTotalRounds
} from '../lib/supabase.js';
import { postAnnouncement } from '../lib/discord.js';
import { dts } from '../lib/time-parser.js';
import { config } from '../config.js';
import { checkRoundCompletion } from '../lib/round-manager.js';

// ── Buttons ───────────────────────────────────────────────────

export function proposeButton(matchId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`propose_time:${matchId}`)
      .setLabel('📅 Propose a match time')
      .setStyle(ButtonStyle.Primary)
  );
}

function acceptDeclineButtons(matchId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`accept_time:${matchId}`)
      .setLabel('✅ Accept')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`counter_propose:${matchId}`)
      .setLabel('🔄 Reschedule')
      .setStyle(ButtonStyle.Secondary)
  );
}

function cheatingConfirmButtons(matchId, accuserId, accusedId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm_cheating:${matchId}:${accuserId}:${accusedId}`)
      .setLabel('I understand, file the report')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`cancel_cheating:${matchId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );
}

function scoreAckButtons(matchId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ack_score_warning:${matchId}`)
      .setLabel('I understand, submit my score')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`cancel_score:${matchId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );
}

function appealButton(matchId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`request_appeal:${matchId}`)
      .setLabel('Request review')
      .setStyle(ButtonStyle.Primary)
  );
}

// ── Schedule prompt ───────────────────────────────────────────

export async function postSchedulePrompt(thread, matchId, windowMs) {
  const deadline = new Date(Date.now() + windowMs);
  const msg = await thread.send({
    content: [
      `## 📅 Schedule your match`,
      ``,
      `One of you goes first. Click the button below to propose a match time.`,
      `You'll enter a **date** (DD/MM) and **time** (HH:MM, 24hr). All times are in **SAST (UTC+2)**.`,
      ``,
      `You have **${config.matchWindowLabel}** to agree on a time. If a proposal goes unanswered, the non-responding player is disqualified. Deadline: ${dts(deadline)}.`,
    ].join('\n'),
    components: [proposeButton(matchId)],
  });
  await setMatchScheduling(matchId, { schedule_msg_id: msg.id });
}

// ── Button handler ────────────────────────────────────────────

export async function handleButton(interaction) {
  const [action, matchId, ...rest] = interaction.customId.split(':');

  // ── Propose / Reschedule ──
  if (action === 'propose_time' || action === 'counter_propose') {
    const match = await getMatchByThreadId(interaction.channelId);

    // Block if already agreed
    if (match?.agreed_time_ts) {
      return interaction.reply({ content: 'A match time has already been agreed and cannot be changed.', flags: 64 });
    }

    // Rule 1.1: block proposals within final 15 minutes
    if (match?.proposal_expires_at) {
      const cutoff = new Date(match.proposal_expires_at).getTime() - config.proposalCutoffMs;
      if (Date.now() > cutoff) {
        return interaction.reply({ content: 'Proposals must be made at least 15 minutes before the match window closes. Your proposal is invalid.', flags: 64 });
      }
    }

    const modalId = action === 'counter_propose' ? 'counter_propose_modal' : 'propose_time_modal';
    const modal = new ModalBuilder()
      .setCustomId(`${modalId}:${matchId}`)
      .setTitle(action === 'counter_propose' ? 'Counter-propose a time' : 'Propose a match time');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('date_input')
          .setLabel('Date (DD/MM), SAST timezone')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('e.g. 21/05')
          .setMinLength(4).setMaxLength(5)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('time_input')
          .setLabel('Time (HH:MM, 24-hour)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('e.g. 20:00')
          .setMinLength(4).setMaxLength(5)
      )
    );
    return interaction.showModal(modal);
  }

  // ── Accept time ──
  if (action === 'accept_time') {
    await interaction.deferUpdate();
    const match = await getMatchByThreadId(interaction.channelId);
    if (!match?.proposed_time_text) return;

    if (interaction.user.id === match.proposed_by_discord_id) {
      return interaction.followUp({ content: 'You proposed this time. Your opponent must accept.', flags: 64 });
    }
    if (match.agreed_time_ts) {
      return interaction.followUp({ content: 'A time is already agreed.', flags: 64 });
    }

    const agreedTs = match.proposed_time_ts ? new Date(match.proposed_time_ts) : null;
    await setMatchScheduling(match.id, {
      agreed_time_text: match.proposed_time_text,
      agreed_time_ts:   match.proposed_time_ts,
    });

    await interaction.message.edit({ components: [] });

    if (match.schedule_msg_id) {
      await interaction.channel.messages.fetch(match.schedule_msg_id)
        .then(m => m.edit({ components: [] })).catch(() => {});
    }

    const pA = match.participant_a;
    const pB = match.participant_b;
    const timeStr = agreedTs ? `${match.proposed_time_text} (${dts(agreedTs)})` : match.proposed_time_text;

    await interaction.channel.send(
      `✅ **Match time locked: ${timeStr}**\n\nBoth players confirmed. The bot will post a score request here at match time. Be ready to play!`
    );

    // Announce scheduled match in #announcements (streaming link only for final 3 matches)
    const { roundName } = await import('../lib/bracket.js');
    const { getTotalRounds } = await import('../lib/supabase.js');
    const tournament = await getActiveTournament();
    const totalRounds = tournament ? await getTotalRounds(tournament.id) : 5;
    const isStreamMatch = match.round_number >= totalRounds - 1;
    await postAnnouncement(interaction.client, [
      `## 📅 Match Scheduled: ${roundName(match.round_number, totalRounds)}`,
      ``,
      `**${pA?.name}** vs **${pB?.name}**`,
      `**Time:** ${timeStr}`,
      ...(isStreamMatch ? [
        ``,
        `This match will be streamed live. Watch on YouTube: https://www.youtube.com/@couchcupp`,
      ] : []),
    ].join('\n'));
    return;
  }

  // ── Submit score — show warning first ──
  if (action === 'submit_score') {
    const match = await getMatchByThreadId(interaction.channelId);
    if (!match) return interaction.reply({ content: 'Thread not linked to a match.', flags: 64 });

    return interaction.reply({
      content: [
        `## ⚠️ Score Submission Rules`,
        ``,
        `By submitting your score you confirm that:`,
        `- Your submission is truthful and accurate`,
        `- You have a screenshot of the final score screen ready to share`,
        ``,
        `**Submitting a false score or colluding with your opponent will result in:**`,
        `- Immediate disqualification from this tournament`,
        `- Permanent ban from all future Couch Cup tournaments`,
        `- Forfeiture of any prize money`,
        `- Your name added to the public cheater list`,
        ``,
        `All match streams are recorded. Screenshots are cross-checked against stream VODs at random. Cheating gets caught.`,
      ].join('\n'),
      components: [scoreAckButtons(matchId)],
      flags: 64,
    });
  }

  // ── Score warning acknowledged ──
  if (action === 'ack_score_warning') {
    const modal = new ModalBuilder()
      .setCustomId(`submit_score_modal:${matchId}`)
      .setTitle('Submit Match Score');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('my_score').setLabel('Your score (goals scored)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. 3')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('opp_score').setLabel("Opponent's score (goals scored)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. 1')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('stream_url').setLabel('Your stream URL (if applicable)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('https://...')
      )
    );
    return interaction.showModal(modal);
  }

  if (action === 'cancel_score') {
    return interaction.update({ content: 'Score submission cancelled.', components: [] });
  }

  // ── Cheating report — show warning first ──
  if (action === 'report_cheating') {
    return interaction.reply({
      content: [
        `## ⚠️ Cheating Report Warning`,
        ``,
        `Cheat reports are taken seriously and reviewed by the Tournament Director.`,
        ``,
        `Before you submit:`,
        `- The accused player's match stream will be reviewed in full`,
        `- The accused player will be notified that a report has been filed`,
        `- The Tournament Director's decision is final`,
        ``,
        `**A false or malicious report carries the same penalties as cheating:**`,
        `- Immediate disqualification from this tournament`,
        `- Permanent ban from all future Couch Cup tournaments`,
        `- Forfeiture of any prize money`,
        `- Your name added to the public cheater list`,
        ``,
        `Reports made in good faith but ultimately unproven will NOT be penalised. Only submit if you have genuine reason to believe your opponent cheated.`,
      ].join('\n'),
      components: [cheatingConfirmButtons(matchId, interaction.user.id, 'tbd')],
      flags: 64,
    });
  }

  // ── Confirm cheating ──
  if (action === 'confirm_cheating') {
    await interaction.deferUpdate();
    const [accuserId, accusedId] = rest;
    const match = await getMatchByThreadId(interaction.channelId);
    if (!match) return;

    if (interaction.user.id !== accuserId) {
      return interaction.followUp({ content: 'Only the original reporter can confirm.', flags: 64 });
    }

    await setMatchScheduling(match.id, { cheating_reported_by: accuserId });
    await interaction.message.edit({ components: [] });
    await interaction.channel.send(`⚠️ Cheating report confirmed. The Tournament Director has been notified and will review the match recording.`);

    if (config.tournamentDirectorId) {
      try {
        const td = await interaction.client.users.fetch(config.tournamentDirectorId);
        const pA = match.participant_a;
        const pB = match.participant_b;
        const accuser = accuserId === pA?.discord_id ? pA : pB;
        const accused = accuserId === pA?.discord_id ? pB : pA;
        await td.send([
          `🚨 **Cheating Report: Action Required**`,
          ``,
          `Match: **${pA?.name} vs ${pB?.name}** (R${match.round_number})`,
          `Reported by: **${accuser?.name}** (${accuser?.psn_id})`,
          `Accused: **${accused?.name}** (${accused?.psn_id})`,
          ``,
          `Please review the stream recording before advancing the winner. Use \`/admin force-result\` once reviewed.`,
        ].join('\n'));
      } catch { /* TD unreachable */ }
    }
    return;
  }

  if (action === 'cancel_cheating') {
    return interaction.update({ content: 'Report cancelled.', components: [] });
  }

  // ── Admin review buttons ──
  if (action === 'adm_restore_both') {
    await interaction.deferUpdate();
    const { getMatchById, setMatchScheduling } = await import('../lib/supabase.js');
    const match = await getMatchById(matchId);
    if (!match) return interaction.followUp({ content: 'Match not found.', flags: 64 });
    const newExpiry = new Date(Date.now() + config.matchWindowMs);
    await setMatchScheduling(match.id, {
      status:             'active',
      dispute_status:     'resolved',
      forfeit_reason:     null,
      proposal_expires_at: newExpiry.toISOString(),
    });
    await interaction.message.edit({ components: [] });
    const thread = await interaction.client.channels.fetch(match.discord_thread_id).catch(() => null);
    if (thread) await thread.send(`✅ **Appeal granted.** Both players restored. New match window: ${dts(newExpiry)}. Please reschedule your match.`);
    return interaction.followUp({ content: 'Both players restored. Match window extended.', flags: 64 });
  }

  if (action === 'adm_confirm_forfeit') {
    await interaction.deferUpdate();
    await interaction.message.edit({ components: [] });
    return interaction.followUp({ content: 'Forfeit confirmed. Run cascading replacement manually via `/admin disqualify`.', flags: 64 });
  }

  if (action === 'adm_reject_appeal') {
    await interaction.deferUpdate();
    const { getMatchById, updateAdminReview, getAdminReview, updateParticipantStatus } = await import('../lib/supabase.js');
    const match  = await getMatchById(matchId);
    const review = await getAdminReview(matchId);
    if (review) await updateAdminReview(review.id, { status: 'rejected_frivolous', resolved_at: new Date().toISOString() });
    if (review?.requesting_player_id) await updateParticipantStatus(review.requesting_player_id, 'eliminated');
    await interaction.message.edit({ components: [] });
    const thread = await interaction.client.channels.fetch(match?.discord_thread_id).catch(() => null);
    if (thread) await thread.send(`❌ **Appeal rejected as frivolous.** The requesting player has been disqualified from the tournament.`);
    return interaction.followUp({ content: 'Appeal rejected. Requesting player disqualified.', flags: 64 });
  }

  // ── Appeal request ──
  if (action === 'request_appeal') {
    const modal = new ModalBuilder()
      .setCustomId(`appeal_modal:${matchId}`)
      .setTitle('Request Tournament Director Review');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('appeal_reason')
          .setLabel('Why do you believe this forfeit was unfair?')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500)
          .setPlaceholder('Explain your situation...')
      )
    );
    return interaction.showModal(modal);
  }
}

// ── Modal handler ─────────────────────────────────────────────

export async function handleModal(interaction) {
  const [action, matchId] = interaction.customId.split(':');

  // ── Time proposal ──
  if (action === 'propose_time_modal' || action === 'counter_propose_modal') {
    await interaction.deferUpdate().catch(() => interaction.deferReply({ flags: 64 }));

    const dateInput = interaction.fields.getTextInputValue('date_input').trim();
    const timeInput = interaction.fields.getTextInputValue('time_input').trim();

    const dateMatch = dateInput.match(/^(\d{1,2})[\/\-\.](\d{1,2})$/);
    const timeMatch = timeInput.match(/^(\d{1,2}):(\d{2})$/);

    if (!dateMatch || !timeMatch) {
      return interaction.followUp({ content: `Invalid format. Date: **DD/MM** (e.g. 21/05), time: **HH:MM** (e.g. 20:00).`, flags: 64 });
    }

    const day = parseInt(dateMatch[1]), month = parseInt(dateMatch[2]) - 1;
    const hour = parseInt(timeMatch[1]), minute = parseInt(timeMatch[2]);
    const year = new Date().getFullYear();

    if (hour > 23 || minute > 59 || day < 1 || day > 31 || month < 0 || month > 11) {
      return interaction.followUp({ content: `Invalid date or time values. Please check and try again.`, flags: 64 });
    }

    const parsed = new Date(Date.UTC(year, month, day, hour - 2, minute)); // SAST = UTC+2
    if (isNaN(parsed.getTime()) || parsed < new Date()) {
      return interaction.followUp({ content: `That time is in the past. Please propose a future time.`, flags: 64 });
    }

    const match = await getMatchByThreadId(interaction.channelId);
    if (!match) return interaction.followUp({ content: 'Thread not linked to a match.', flags: 64 });

    // Match must be played within the match window
    const matchDeadline = match.scheduled_at
      ? new Date(new Date(match.scheduled_at).getTime() + config.matchWindowMs)
      : new Date(Date.now() + config.matchWindowMs);
    if (parsed > matchDeadline) {
      return interaction.followUp({
        content: `Your proposed time is outside the match window. The match must be played by ${dts(matchDeadline)}. Please choose an earlier time.`,
        flags: 64,
      });
    }

    // Rule 1.1: block proposals within final 15 minutes
    const windowEnd = match.proposal_expires_at
      ? new Date(match.proposal_expires_at)
      : new Date(Date.now() + config.matchWindowMs);
    const cutoff = windowEnd.getTime() - config.proposalCutoffMs;
    if (Date.now() > cutoff) {
      return interaction.followUp({ content: 'Proposals must be made at least 15 minutes before the match window closes. Your proposal is invalid.', flags: 64 });
    }

    const expires = windowEnd;
    const timeText = `${String(day).padStart(2,'0')}/${String(month+1).padStart(2,'0')} ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')} SAST`;

    await setMatchScheduling(match.id, {
      proposed_time_text:      timeText,
      proposed_time_ts:        parsed.toISOString(),
      proposed_by_discord_id:  interaction.user.id,
      proposal_expires_at:     expires.toISOString(),
      agreed_time_text:        null,
      agreed_time_ts:          null,
      courtesy_ping_sent:      false,
    });

    const pA = match.participant_a;
    const pB = match.participant_b;
    const proposerIsA = interaction.user.id === pA?.discord_id;
    const opponent = proposerIsA
      ? (pB?.discord_id ? `<@${pB.discord_id}>` : pB?.name)
      : (pA?.discord_id ? `<@${pA.discord_id}>` : pA?.name);

    await interaction.channel.send({
      content: [
        `📅 **Time proposed by <@${interaction.user.id}>: ${timeText}** (${dts(parsed)})`,
        ``,
        `${opponent}: do you accept this time?`,
        ``,
        `Accept or reschedule by ${dts(expires)}. If you do not respond, you will be disqualified by default.`,
      ].join('\n'),
      components: [acceptDeclineButtons(matchId)],
    });

    // Log to mod-log
    await logToModLog(interaction.client, `📅 Proposal logged | Match ${matchId} | <@${interaction.user.id}> proposed ${timeText} | Expires ${dts(expires, 'R')}`);
    return;
  }

  // ── Score submission ──
  if (action === 'submit_score_modal') {
    await interaction.deferReply({ flags: 64 });
    const match = await getMatchByThreadId(interaction.channelId);
    if (!match) return interaction.editReply('Thread not linked to a match.');

    const myScore   = parseInt(interaction.fields.getTextInputValue('my_score'));
    const oppScore  = parseInt(interaction.fields.getTextInputValue('opp_score'));
    const streamUrl = interaction.fields.getTextInputValue('stream_url')?.trim() || null;

    if (isNaN(myScore) || isNaN(oppScore)) return interaction.editReply('Invalid scores. Enter numbers only.');

    const pA = match.participant_a;
    const pB = match.participant_b;
    const reporterIsA = interaction.user.id === pA?.discord_id;
    if (!reporterIsA && interaction.user.id !== pB?.discord_id) {
      return interaction.editReply('Only match participants can submit scores.');
    }

    const alreadyReported = reporterIsA ? match.reported_by_a : match.reported_by_b;
    if (alreadyReported) return interaction.editReply('You have already submitted a score for this match.');

    // Store score — only set score fields on first submission to avoid overwriting
    const reportedFlag = reporterIsA ? { reported_by_a: true, stream_url_a: streamUrl } : { reported_by_b: true, stream_url_b: streamUrl };
    await updateMatch(match.id, reportedFlag);

    const claimedWinner = myScore > oppScore ? (reporterIsA ? pA.id : pB.id) : (reporterIsA ? pB.id : pA.id);
    await insertScoreReport({
      bracket_id:     match.id,
      reporter_id:    reporterIsA ? pA.id : pB.id,
      claimed_winner: claimedWinner,
      score_reporter: myScore,
      score_opponent: oppScore,
      stream_url:     streamUrl,
    });

    await interaction.editReply(`Score submitted. Waiting for your opponent.`);
    await logToModLog(interaction.client, `📊 Score submitted | Match ${match.id} | <@${interaction.user.id}> reported ${myScore}-${oppScore}`);

    const fresh = await getMatchByThreadId(interaction.channelId);
    if (!fresh.reported_by_a || !fresh.reported_by_b) return;

    // Both reported — compare via score_reports (never use brackets scores which can be overwritten)
    const { getScoreReports } = await import('../lib/supabase.js');
    const reports = await getScoreReports(match.id);
    const reportA = reports.find(r => r.reporter_id === pA.id);
    const reportB = reports.find(r => r.reporter_id === pB.id);
    const scoresAgree = reportA && reportB && reportA.claimed_winner === reportB.claimed_winner;

    // Store agreed scores on brackets for display
    if (scoresAgree && reportA) {
      await updateMatch(match.id, {
        score_a: reporterIsA ? myScore : oppScore,
        score_b: reporterIsA ? oppScore : myScore,
      });
    }
    if (!scoresAgree) {
      const screenshotDue = new Date(Date.now() + config.scoreWindowMs);
      await updateMatch(match.id, {
        dispute_flag: true,
        dispute_status: 'pending_screenshots',
        score_due_at: screenshotDue.toISOString(),
      });
      await interaction.channel.send([
        `⚠️ **Score conflict detected.**`,
        ``,
        `Both players reported different results. Both players must do the following within ${config.scoreWindowLabel}:`,
        `1. Upload a screenshot of your final in-game score screen in this thread.`,
        `2. Post the link to your match stream recording in this thread.`,
        ``,
        `If only one player submits evidence, the other is disqualified. If both submit, the Tournament Director will review and decide.`,
      ].join('\n'));
      return;
    }

    // Scores agree — advance winner (use claimed_winner from reports)
    const winnerId = reportA.claimed_winner;
    const loserId  = winnerId === pA.id ? pB.id : pA.id;
    const winner   = winnerId === pA.id ? pA : pB;
    const loser    = loserId  === pA.id ? pA : pB;

    await advanceWinner(fresh, winnerId);
    await updateParticipantStatus(loser.id, 'eliminated');
    await interaction.channel.send(isFinal
      ? `✅ **Result confirmed.** **${winner.name}** wins the tournament! 🏆`
      : `✅ **Result confirmed.** **${winner.name}** advances. Well played.`
    );

    const tournament = await getActiveTournament();
    const totalRounds = tournament ? await getTotalRounds(tournament.id) : 5;
    const isFinal = fresh.round_number === totalRounds;

    if (isFinal) {
      await updateParticipantStatus(winner.id, 'winner');
      if (tournament) await setTournamentStatus(tournament.id, 'completed');
      await postAnnouncement(interaction.client, [
        `# 🏆 WE HAVE A CHAMPION!`,
        ``,
        `Congratulations to **${winner.name}** (${winner.psn_id}): the Couch Cup EA FC 26 champion!`,
        `Final result: **${winner.name}** def. **${loser.name}** (${fresh.score_a}-${fresh.score_b})`,
        ``,
        `Watch the VOD on YouTube: https://www.youtube.com/@couchcupp`,
        ``,
        `Thank you to all players who competed. See you next season! 🎮`,
      ].join('\n'));
    } else {
      await postAnnouncement(interaction.client, [
        `## R${fresh.round_number} Result`,
        `**${winner.name}** def. **${loser.name}** (${fresh.score_a}-${fresh.score_b})`,
        `**${winner.name}** advances to Round ${fresh.round_number + 1}.`,
      ].join('\n'));
      // Auto-open next round if all R matches are done
      checkRoundCompletion(interaction.client, fresh).catch(err =>
        console.error('[match-flow] checkRoundCompletion failed:', err.message)
      );
    }
    return;
  }

  // ── Appeal modal ──
  if (action === 'appeal_modal') {
    await interaction.deferReply({ flags: 64 });
    const match = await getMatchByThreadId(interaction.channelId);
    if (!match) return interaction.editReply('Thread not linked to a match.');

    const reasonText = interaction.fields.getTextInputValue('appeal_reason').trim();
    const tournament = await getActiveTournament();

    const pA = match.participant_a;
    const pB = match.participant_b;
    const requester = interaction.user.id === pA?.discord_id ? pA : pB;

    await createAdminReview({
      tournament_id:        tournament?.id,
      match_id:             match.id,
      requesting_player_id: requester?.id,
      reason_text:          reasonText,
      status:               'pending',
    });

    await setMatchScheduling(match.id, { dispute_status: 'pending_appeal' });
    await interaction.editReply('Your appeal has been submitted. The Tournament Director will review your case. Cascading replacement is paused until a decision is made.');

    await dmTD(interaction.client, [
      `📋 **Appeal Request: Action Required**`,
      `Match: **${pA?.name} vs ${pB?.name}** (R${match.round_number})`,
      `Requested by: **${requester?.name}**`,
      `Reason: ${reasonText}`,
      ``,
      `Use \`/admin review-forfeit ${match.id}\` to act.`,
      `Thread: https://discord.com/channels/${config.guildId}/${match.discord_thread_id}`,
    ].join('\n'));
    return;
  }
}

// ── Helpers ───────────────────────────────────────────────────

async function logToModLog(client, message) {
  try {
    const ch = await client.channels.fetch(config.modLogChannel);
    await ch.send(message);
  } catch { /* mod-log unavailable */ }
}

async function dmTD(client, message) {
  if (!config.tournamentDirectorId) return;
  try {
    const td = await client.users.fetch(config.tournamentDirectorId);
    await td.send(message);
  } catch { /* TD unreachable */ }
}
