import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { postAnnouncement } from './discord.js';
import {
  getActiveMatchesForScheduler, setMatchScheduling, updateMatch,
  advanceWinner, updateParticipantStatus, getActiveTournament,
  incrementForfeitAdvances, getPreviousRoundLosers, getMatchById, getMatchesByRound,
  getParticipantsNeedingDiscordCheck, setAddedToDiscord,
} from './supabase.js';
import { config } from '../config.js';
import { dts } from './time-parser.js';
import { appealButton } from '../handlers/match-flow-exports.js';
import { checkRoundCompletion } from './round-manager.js';

export function startSchedulerLoop(client) {
  setInterval(() => runTick(client).catch(err => console.error('[scheduler]', err.message)), 30_000);
  console.log('[scheduler] started (30s interval)');
}

async function runTick(client) {
  await syncDiscordStatus(client).catch(err => console.error('[scheduler] syncDiscordStatus:', err.message));

  const matches = await getActiveMatchesForScheduler();
  const now = Date.now();

  for (const match of matches) {
    if (match.status === 'completed' || match.dispute_status === 'pending_appeal') continue;

    const windowEnd = match.proposal_expires_at ? new Date(match.proposal_expires_at).getTime() : null;
    const cutoff15  = windowEnd ? windowEnd - config.proposalCutoffMs : null;

    // Rule 1.3: courtesy ping at 30 min after proposal, if not yet responded
    if (match.proposed_by_discord_id && !match.agreed_time_ts && !match.courtesy_ping_sent && match.proposed_time_ts) {
      const proposedAt = new Date(match.proposed_time_ts).getTime(); // Using proposed_time_ts as proxy
      // Actually track when proposal was made via proposal_expires_at - matchWindowMs
      const proposalMadeAt = windowEnd ? windowEnd - config.matchWindowMs : null;
      if (proposalMadeAt && now > proposalMadeAt + 30 * 60 * 1000 && cutoff15 && now < cutoff15) {
        await sendCourtesyPing(client, match);
        await setMatchScheduling(match.id, { courtesy_ping_sent: true });
      }
    }

    // Rule 1.2 / 1.4: proposal expired (15-min cutoff passed) without response → proposer wins
    if (match.proposed_by_discord_id && !match.agreed_time_ts && cutoff15 && now > cutoff15) {
      const forfeitReason = match.reschedule_attempted_at ? 'no_counterproposal' : 'opponent_ghosted';
      await handleProposalTimeout(client, match, forfeitReason);
      continue;
    }

    // No proposal at all and window expired → both disqualified / cascading
    if (!match.proposed_by_discord_id && match.scheduled_at) {
      const windowExpiry = new Date(match.scheduled_at).getTime() + config.matchWindowMs;
      if (now > windowExpiry && !match.score_requested_at) {
        await handleBothNoShow(client, match);
        continue;
      }
    }

    // Agreed time reached → post score request
    if (match.agreed_time_ts && !match.score_requested_at) {
      if (now >= new Date(match.agreed_time_ts).getTime()) {
        await postScoreRequest(client, match);
        continue;
      }
    }

    // Screenshot deadline expired (disputed match, not yet resolved)
    // Add 10-second buffer to avoid race with screenshot listener
    if (match.dispute_flag && match.dispute_status === 'pending_screenshots' && match.score_due_at) {
      if (now > new Date(match.score_due_at).getTime() + 10_000) {
        await handleScreenshotTimeout(client, match);
        continue;
      }
    }

    // Score window expired
    if (match.score_requested_at && match.status !== 'completed' && !match.dispute_flag) {
      if (now > new Date(match.score_due_at).getTime()) {
        await handleScoreTimeout(client, match);
      }
    }
  }
}

async function sendCourtesyPing(client, match) {
  const thread = await client.channels.fetch(match.discord_thread_id).catch(() => null);
  if (!thread) return;
  const pA = match.participant_a;
  const pB = match.participant_b;
  const responder = match.proposed_by_discord_id === pA?.discord_id ? pB : pA;
  const deadline = match.proposal_expires_at ? new Date(new Date(match.proposal_expires_at).getTime() - config.proposalCutoffMs) : null;
  await thread.send(
    `${responder?.discord_id ? `<@${responder.discord_id}>` : responder?.name}: you have a pending proposal from your opponent.${deadline ? ` Deadline: ${dts(deadline)}.` : ''} Respond before the cutoff or you'll forfeit.`
  );
}

async function handleProposalTimeout(client, match, forfeitReason) {
  const pA = match.participant_a;
  const pB = match.participant_b;
  const proposerIsA = match.proposed_by_discord_id === pA?.discord_id;
  const winner = proposerIsA ? pA : pB;
  const loser  = proposerIsA ? pB : pA;

  await advanceWinner(match, winner.id);
  await updateParticipantStatus(loser.id, 'eliminated');
  await setMatchScheduling(match.id, { forfeit_reason: forfeitReason, status: 'completed' });

  const newCount = await incrementForfeitAdvances(winner.id);
  await checkTwoStrikeReview(client, match, winner, newCount);

  const thread = await client.channels.fetch(match.discord_thread_id).catch(() => null);
  if (thread) {
    await thread.send(`⏰ **Match window expired.** **${loser.name}** did not respond to the time proposal and has forfeited. **${winner.name}** advances.`);
  }

  const { roundName } = await import('../lib/bracket.js');
  const { getTotalRounds } = await import('./supabase.js');
  const tournament = await getActiveTournament();
  const totalRounds = tournament ? await getTotalRounds(tournament.id) : 5;
  await postAnnouncement(client, [
    `## ${roundName(match.round_number, totalRounds)} Result`,
    `**${winner.name}** advances. **${loser.name}** forfeited (no response to proposal).`,
  ].join('\n'));

  console.log(`[scheduler] proposal timeout (${forfeitReason}): ${winner.name} advances`);
  checkRoundCompletion(client, match).catch(err => console.error('[scheduler] checkRoundCompletion:', err.message));
}

async function handleBothNoShow(client, match) {
  const pA = match.participant_a;
  const pB = match.participant_b;

  // Check if appeal is available (Rule 5.1/5.2 — skip for now, trigger cascading)
  await setMatchScheduling(match.id, {
    forfeit_reason: match.round_number === 1 ? 'both_ghosted_r1' : 'both_ghosted',
    status: 'completed',
  });
  await updateParticipantStatus(pA.id, 'eliminated');
  await updateParticipantStatus(pB.id, 'eliminated');

  const thread = await client.channels.fetch(match.discord_thread_id).catch(() => null);
  if (thread) {
    await thread.send(`❌ **Both players forfeited.** Neither player proposed a match time. This slot is forfeit.`);
  }

  const { roundName } = await import('../lib/bracket.js');
  const { getTotalRounds } = await import('./supabase.js');
  const tournament2 = await getActiveTournament();
  const totalRounds2 = tournament2 ? await getTotalRounds(tournament2.id) : 5;
  await postAnnouncement(client, [
    `## ${roundName(match.round_number, totalRounds2)} Result`,
    `**${pA.name}** and **${pB.name}** both forfeited. Neither player scheduled their match.`,
  ].join('\n'));

  await triggerCascadingReplacement(client, match);
  checkRoundCompletion(client, match).catch(err => console.error('[scheduler] checkRoundCompletion:', err.message));
  console.log(`[scheduler] both no-show: R${match.round_number} match ${match.id}`);
}

async function triggerCascadingReplacement(client, match) {
  const tournament = await getActiveTournament();
  if (!tournament) return;

  if (match.round_number === 1) {
    // Check if the next round now has exactly one finalist with no opponent
    const nextRoundMatches = await getMatchesByRound(tournament.id, 2);
    const soloFinalist = nextRoundMatches.find(m =>
      (m.participant_a_id && !m.participant_b_id) || (!m.participant_a_id && m.participant_b_id)
    );

    if (soloFinalist) {
      const { getTotalRounds, updateParticipantStatus: updStatus, setTournamentStatus: setStatus } = await import('./supabase.js');
      const totalRounds = await getTotalRounds(tournament.id);
      const winner = soloFinalist.participant_a_id
        ? soloFinalist.participant_a
        : soloFinalist.participant_b;

      if (winner) {
        await updateMatch(soloFinalist.id, { winner_id: winner.id, status: 'completed' });
        await updStatus(winner.id, 'winner');
        await setStatus(tournament.id, 'completed');

        await postAnnouncement(client, [
          `# 🏆 WE HAVE A CHAMPION!`,
          ``,
          `**${winner.name}** (${winner.psn_id}) wins the Couch Cup EA FC 26 tournament by walkover.`,
          `Both opposing finalists forfeited. **${winner.name}** is the champion!`,
          ``,
          `Thank you to all players who competed. See you next season! 🎮`,
        ].join('\n'));
        return;
      }
    }

    await dmTD(client, `⚠️ **Double forfeit in R${match.round_number}**: cascading replacement needed. Match: ${match.participant_a?.name} vs ${match.participant_b?.name}. Please review and use \`/admin disqualify\` or \`/admin override-match\`.`);
    return;
  }

  // Rule 4.2: find best replacement from previous round losers
  const losers = await getPreviousRoundLosers(tournament.id, match.round_number);
  if (!losers.length) {
    await dmTD(client, `⚠️ **Double forfeit in R${match.round_number}**: no eligible replacements found. Manual action required.`);
    return;
  }

  const replacement = losers[0];
  // Place replacement in the empty slot
  const slot = !match.participant_a_id ? 'participant_a_id' : 'participant_b_id';
  await updateMatch(match.id, { [slot]: replacement.id, status: 'pending', forfeit_reason: null });
  await updateParticipantStatus(replacement.id, 'bracket');

  const thread = await client.channels.fetch(match.discord_thread_id).catch(() => null);
  if (thread) {
    await thread.send(
      `🔄 **Cascading Replacement.** ${replacement.discord_id ? `<@${replacement.discord_id}>` : replacement.name} has been reactivated due to opponent forfeit. Match window opens now.`
    );
  }
}

async function handleScreenshotTimeout(client, match) {
  const { supabase } = await import('./supabase.js');
  const { data: reports } = await supabase
    .from('score_reports')
    .select('screenshot_url, reporter_id')
    .eq('bracket_id', match.id);

  const pA = match.participant_a;
  const pB = match.participant_b;
  console.log(`[screenshot-timeout] match ${match.id} | reports found: ${reports?.length ?? 0} | pA: ${pA?.id} | pB: ${pB?.id}`);
  reports?.forEach(r => console.log(`  reporter=${r.reporter_id} screenshot=${r.screenshot_url ? 'YES' : 'NO'}`));

  const aUploaded = reports?.find(r => r.reporter_id === pA?.id && r.screenshot_url);
  const bUploaded = reports?.find(r => r.reporter_id === pB?.id && r.screenshot_url);

  // If both uploaded, don't act — the listener will DM the TD
  if (aUploaded && bUploaded) {
    console.log(`[screenshot-timeout] both uploaded, skipping timeout action`);
    return;
  }
  const thread = await client.channels.fetch(match.discord_thread_id).catch(() => null);

  if (aUploaded && !bUploaded) {
    await advanceWinner(match, pA.id);
    await updateParticipantStatus(pB.id, 'eliminated');
    await setMatchScheduling(match.id, { forfeit_reason: 'no_score_submission', status: 'completed', dispute_status: 'resolved' });
    if (thread) await thread.send(`⏰ Screenshot deadline passed. **${pB.name}** did not upload a screenshot and has been disqualified. **${pA.name}** advances.`);
    const { roundName } = await import('../lib/bracket.js');
    const { getTotalRounds } = await import('./supabase.js');
    const t = await getActiveTournament();
    const tr = t ? await getTotalRounds(t.id) : 5;
    await postAnnouncement(client, `## ${roundName(match.round_number, tr)} Result\n**${pA.name}** advances. **${pB.name}** disqualified (no screenshot submitted).`);
    checkRoundCompletion(client, match).catch(() => {});
    return;
  }

  if (!aUploaded && bUploaded) {
    await advanceWinner(match, pB.id);
    await updateParticipantStatus(pA.id, 'eliminated');
    await setMatchScheduling(match.id, { forfeit_reason: 'no_score_submission', status: 'completed', dispute_status: 'resolved' });
    if (thread) await thread.send(`⏰ Screenshot deadline passed. **${pA.name}** did not upload a screenshot and has been disqualified. **${pB.name}** advances.`);
    const { roundName } = await import('../lib/bracket.js');
    const { getTotalRounds } = await import('./supabase.js');
    const t = await getActiveTournament();
    const tr = t ? await getTotalRounds(t.id) : 5;
    await postAnnouncement(client, `## ${roundName(match.round_number, tr)} Result\n**${pB.name}** advances. **${pA.name}** disqualified (no screenshot submitted).`);
    checkRoundCompletion(client, match).catch(() => {});
    return;
  }

  // Neither uploaded — DM TD, mark as admin_review to stop scheduler re-firing
  await setMatchScheduling(match.id, { dispute_status: 'admin_review' });
  await dmTD(client, `⚠️ **Score dispute unresolved** — neither player uploaded a screenshot for **${pA.name} vs ${pB.name}** (R${match.round_number}). Manual action required: \`/admin override-match ${match.id} <winner_psn>\``);
  if (thread) await thread.send(`⏰ Screenshot deadline passed with no uploads. The Tournament Director will decide the result.`);
}

async function postScoreRequest(client, match) {
  const scoreDue = new Date(Date.now() + config.scoreWindowMs);
  await setMatchScheduling(match.id, {
    score_requested_at: new Date().toISOString(),
    score_due_at:       scoreDue.toISOString(),
  });

  const thread = await client.channels.fetch(match.discord_thread_id).catch(() => null);
  if (!thread) return;

  await thread.send({
    content: [
      `⏰ **It's match time.**`,
      ``,
      `Both players: play your match now and submit your scores below.`,
      `You have until ${dts(scoreDue)} (${config.scoreWindowLabel}). Failure to submit = disqualification.`,
      ``,
      `Both players must submit independently.`,
    ].join('\n'),
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`submit_score:${match.id}`).setLabel('📊 Submit Score').setStyle(ButtonStyle.Primary)
      ),
    ],
  });
  console.log(`[scheduler] score request posted: match ${match.id}`);
}

async function handleScoreTimeout(client, match) {
  const pA = match.participant_a;
  const pB = match.participant_b;
  const thread = await client.channels.fetch(match.discord_thread_id).catch(() => null);

  if (match.reported_by_a && !match.reported_by_b) {
    // Rule 2.3: pA submitted, pB didn't → pA wins
    await advanceWinner(match, pA.id);
    await updateParticipantStatus(pB.id, 'eliminated');
    await setMatchScheduling(match.id, { forfeit_reason: 'no_score_submission', status: 'completed' });
    const newCount = await incrementForfeitAdvances(pA.id);
    await checkTwoStrikeReview(client, match, pA, newCount);
    if (thread) await thread.send(`⏰ Score window expired. **${pB.name}** did not submit a score and has forfeited. **${pA.name}** advances.`);
    checkRoundCompletion(client, match).catch(err => console.error('[scheduler] checkRoundCompletion:', err.message));
    return;
  }

  if (!match.reported_by_a && match.reported_by_b) {
    // Rule 2.3: pB submitted, pA didn't → pB wins
    await advanceWinner(match, pB.id);
    await updateParticipantStatus(pA.id, 'eliminated');
    await setMatchScheduling(match.id, { forfeit_reason: 'no_score_submission', status: 'completed' });
    const newCount = await incrementForfeitAdvances(pB.id);
    await checkTwoStrikeReview(client, match, pB, newCount);
    if (thread) await thread.send(`⏰ Score window expired. **${pA.name}** did not submit a score and has forfeited. **${pB.name}** advances.`);
    checkRoundCompletion(client, match).catch(err => console.error('[scheduler] checkRoundCompletion:', err.message));
    return;
  }

  // Rule 2.4: neither submitted → both forfeit
  await setMatchScheduling(match.id, { forfeit_reason: 'both_ghosted', status: 'completed' });
  await updateParticipantStatus(pA.id, 'eliminated');
  await updateParticipantStatus(pB.id, 'eliminated');
  if (thread) await thread.send(`❌ **Both players disqualified.** Neither submitted a score within ${config.scoreWindowLabel}. This slot is forfeit.`);

  await dmTD(client, `⚠️ **Double disqualification: no scores submitted**\nMatch: ${pA.name} vs ${pB.name} (R${match.round_number})`);
  await triggerCascadingReplacement(client, match);
}

async function checkTwoStrikeReview(client, match, player, forfeitCount) {
  if (forfeitCount < 2) return;

  await updateParticipantStatus(player.id, 'flagged');
  // Set flagged_for_review on participants table
  const { supabase } = await import('./supabase.js');
  await supabase.from('participants').update({ flagged_for_review: true }).eq('id', player.id);

  const logMsg = [
    `🚩 **Two-Strike Flag** | **${player.name}** has advanced via opponent forfeit twice in this tournament.`,
    `Their next match is paused pending admin review.`,
    `Use \`/admin clear-flag ${player.id}\` to allow them to continue, or \`/admin disqualify ${player.id} <reason>\` to remove them.`,
  ].join('\n');

  try {
    const ch = await client.channels.fetch(config.modLogChannel);
    await ch.send(logMsg);
  } catch { /* mod-log unavailable */ }

  await dmTD(client, [
    `🚩 **FLAGGED FOR REVIEW: ${player.name}** (@${player.discord_id})`,
    `Has advanced ${forfeitCount} times in this tournament without playing a real match.`,
    ``,
    `Use \`/admin clear-flag ${player.id}\` to clear and reset to 0.`,
    `Use \`/admin disqualify ${player.id} <reason>\` to remove from bracket.`,
  ].join('\n'));
}

async function syncDiscordStatus(client) {
  const participants = await getParticipantsNeedingDiscordCheck();
  if (!participants.length) return;
  const guild = await client.guilds.fetch(config.guildId).catch(() => null);
  if (!guild) return;
  for (const p of participants) {
    const inGuild = await guild.members.fetch(p.discord_id).then(() => true).catch(() => false);
    await setAddedToDiscord(p.id, inGuild);
  }
}

async function dmTD(client, message) {
  if (!config.tournamentDirectorId) return;
  try {
    const td = await client.users.fetch(config.tournamentDirectorId);
    await td.send(message);
  } catch { /* TD unreachable */ }
}
