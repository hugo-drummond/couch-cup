import { postAnnouncement, createMatchThread } from './discord.js';
import { getActiveTournament, getMatchesByRound, updateMatch, getTotalRounds, updateParticipantStatus, setTournamentStatus } from './supabase.js';
import { roundName } from './bracket.js';
import { config } from '../config.js';
import { dts } from './time-parser.js';
// postSchedulePrompt loaded dynamically to avoid circular dep with match-flow.js

// Open a round: create threads, post announcement, start schedule prompts.
// Returns { opened, total } or throws.
export async function openRound(client, roundNumber, tournament) {
  const totalRounds = await getTotalRounds(tournament.id);
  const matches = await getMatchesByRound(tournament.id, roundNumber);
  const pending = matches.filter(m => m.status === 'pending' && m.participant_a_id && m.participant_b_id);

  if (!pending.length) return { opened: 0, total: 0 };

  const playerNames = [];
  let opened = 0;

  for (let i = 0; i < pending.length; i++) {
    const match = pending[i];
    // Throttle: 1 thread per 1.5s to stay under Discord's 5/5s rate limit
    if (i > 0) await new Promise(r => setTimeout(r, 1500));
    let thread;
    try {
      thread = await createMatchThread(client, match, roundNumber);
    } catch (err) {
      console.error(`[round-manager] thread creation failed for match ${match.id}:`, err.message);
      continue;
    }
    try {
      await updateMatch(match.id, {
        status:            'active',
        discord_thread_id: thread.id,
        scheduled_at:      new Date().toISOString(),
      });
      playerNames.push(`${match.participant_a.name} vs ${match.participant_b.name}`);
      opened++;
      import('../handlers/match-flow.js').then(({ postSchedulePrompt }) =>
        postSchedulePrompt(thread, match.id, config.matchWindowMs)
      ).catch(err => console.error('[round-manager] schedule prompt failed:', err.message));
    } catch (err) {
      console.error(`[round-manager] DB update failed for match ${match.id}:`, err.message);
    }
  }

  if (!opened) return { opened: 0, total: pending.length };

  const deadline = new Date(Date.now() + config.matchWindowMs);
  await postAnnouncement(client, [
    `## 🎮 ${roundName(roundNumber, totalRounds)} is OPEN!`,
    ``,
    `**${opened} match${opened !== 1 ? 'es' : ''}** ready to play. Check your scheduling threads.`,
    ``,
    `**Match window closes:** ${dts(deadline)} *(${config.matchWindowLabel})*`,
    ``,
    playerNames.map(n => `• ${n}`).join('\n'),
  ].join('\n'));

  console.log(`[round-manager] R${roundNumber} opened: ${opened}/${pending.length} threads`);
  return { opened, total: pending.length };
}

// Called after every winner advance. Checks if the current round is fully complete
// and if so, auto-opens the next round (or declares champion).
export async function checkRoundCompletion(client, completedMatch) {
  const tournament = await getActiveTournament();
  if (!tournament) return;

  const roundNumber  = completedMatch.round_number;
  const totalRounds  = await getTotalRounds(tournament.id);
  const allMatches   = await getMatchesByRound(tournament.id, roundNumber);

  // Round complete when all matches are completed or forfeited
  const incomplete = allMatches.filter(m =>
    m.status !== 'completed' && m.status !== 'bye'
  );
  if (incomplete.length > 0) return; // round still in progress

  console.log(`[round-manager] R${roundNumber} complete. Checking next steps...`);

  if (roundNumber >= totalRounds) {
    // Final round done — champion should already be declared by score handler.
    // Nothing to do here.
    return;
  }

  const nextRound = roundNumber + 1;

  // Validate next round has correct participants assigned
  const nextMatches = await getMatchesByRound(tournament.id, nextRound);
  const ready = nextMatches.filter(m => m.participant_a_id && m.participant_b_id);

  // Solo finalist — declare walkover champion without opening a round
  const solo = nextMatches.find(m =>
    (m.participant_a_id && !m.participant_b_id) || (!m.participant_a_id && m.participant_b_id)
  );
  if (solo) {
    const winner = solo.participant_a_id ? solo.participant_a : solo.participant_b;
    if (winner && nextRound === totalRounds) {
      await updateMatch(solo.id, { winner_id: winner.id, status: 'completed' });
      await updateParticipantStatus(winner.id, 'winner');
      await setTournamentStatus(tournament.id, 'completed');
      await postAnnouncement(client, [
        `# 🏆 WE HAVE A CHAMPION!`,
        ``,
        `**${winner.name}** (${winner.psn_id}) wins the Couch Cup EA FC 26 tournament!`,
        `All opposing finalists were eliminated. **${winner.name}** advances by walkover.`,
        ``,
        `Watch the VOD on YouTube: https://www.youtube.com/@couchcupp`,
        ``,
        `Thank you to all players who competed. See you next season! 🎮`,
      ].join('\n'));
      console.log(`[round-manager] walkover champion: ${winner.name}`);
    } else {
      console.warn(`[round-manager] solo finalist in R${nextRound} but not the final round — manual action needed`);
    }
    return;
  }

  if (ready.length === 0) {
    console.warn(`[round-manager] R${nextRound} has no assigned participants yet — skipping auto-open`);
    return;
  }

  // Sanity check: every match in next round should have both participants
  const missingParticipants = nextMatches.filter(m => !m.participant_a_id || !m.participant_b_id);
  if (missingParticipants.length > 0) {
    console.warn(`[round-manager] R${nextRound} has ${missingParticipants.length} match(es) missing participants — skipping auto-open`);
    try {
      const td = await client.users.fetch(config.tournamentDirectorId);
      await td.send(`⚠️ Round ${nextRound} is missing participants in ${incomplete.length} match slot(s). Manual review needed.`);
    } catch { /* TD unreachable */ }
    return;
  }

  // 10-second buffer so R1 results announcements land first
  await new Promise(resolve => setTimeout(resolve, 10_000));

  await openRound(client, nextRound, tournament);
}
