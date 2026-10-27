import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

const db = () => supabase;

// ── Participants ──────────────────────────────────────────────

export async function getBracketParticipants() {
  const { data, error } = await db()
    .from('participants')
    .select('*')
    .eq('status', 'bracket')
    .eq('is_eligible', true);
  if (error) throw error;
  return data;
}

export async function getParticipantByDiscordId(discordId) {
  const { data, error } = await db()
    .from('participants')
    .select('*')
    .eq('discord_id', discordId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data ?? null;
}

export async function getParticipantByPsn(psnId) {
  const { data, error } = await db()
    .from('participants')
    .select('*')
    .ilike('psn_id', psnId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data ?? null;
}

export async function updateParticipantStatus(id, status) {
  const { error } = await db()
    .from('participants')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}

// ── Tournaments ───────────────────────────────────────────────

export async function getActiveTournament() {
  const { data, error } = await db()
    .from('active_tournament')
    .select('*')
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data ?? null;
}

export async function setTournamentStatus(id, status) {
  const update = { status };
  if (status === 'active')    update.started_at = new Date().toISOString();
  if (status === 'completed') update.ended_at   = new Date().toISOString();
  const { error } = await db()
    .from('tournaments')
    .update(update)
    .eq('id', id);
  if (error) throw error;
}

// ── Brackets ─────────────────────────────────────────────────

export async function insertMatches(matches) {
  const { error } = await db().from('brackets').insert(matches);
  if (error) throw error;
}

export async function getMatchesByRound(tournamentId, roundNumber) {
  const { data, error } = await db()
    .from('brackets')
    .select(`
      *,
      participant_a:participant_a_id(id, name, psn_id, discord_id),
      participant_b:participant_b_id(id, name, psn_id, discord_id),
      winner:winner_id(id, name, psn_id)
    `)
    .eq('tournament_id', tournamentId)
    .eq('round_number', roundNumber)
    .order('position');
  if (error) throw error;
  return data;
}

export async function getMatchByThreadId(threadId) {
  const { data, error } = await db()
    .from('brackets')
    .select(`
      *,
      participant_a:participant_a_id(id, name, psn_id, discord_id),
      participant_b:participant_b_id(id, name, psn_id, discord_id)
    `)
    .eq('discord_thread_id', threadId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data ?? null;
}

export async function updateMatch(id, updates) {
  const { error } = await db()
    .from('brackets')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function advanceWinner(match, winnerId) {
  const nextPosition = Math.ceil(match.position / 2);
  const slot = match.position % 2 === 1 ? 'participant_a_id' : 'participant_b_id';

  await updateMatch(match.id, {
    winner_id:    winnerId,
    status:       'completed',
    completed_at: new Date().toISOString(),
  });

  // Place winner into next round slot (rounds 2–5 pre-exist as empty rows)
  const { error } = await db()
    .from('brackets')
    .update({ [slot]: winnerId })
    .eq('tournament_id', match.tournament_id)
    .eq('round_number',  match.round_number + 1)
    .eq('position',      nextPosition);
  if (error) throw error;
}

// ── Match Scheduling ──────────────────────────────────────────

export async function getTotalRounds(tournamentId) {
  const { data, error } = await db()
    .from('brackets')
    .select('round_number')
    .eq('tournament_id', tournamentId)
    .order('round_number', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.round_number ?? 1;
}

export async function getActiveMatchesForScheduler() {
  const { data, error } = await db()
    .from('brackets')
    .select(`
      *,
      participant_a:participant_a_id(id, name, psn_id, discord_id),
      participant_b:participant_b_id(id, name, psn_id, discord_id)
    `)
    .eq('status', 'active');
  if (error) throw error;
  return data ?? [];
}

export async function setMatchScheduling(id, fields) {
  const { error } = await db().from('brackets').update(fields).eq('id', id);
  if (error) throw error;
}

// ── Tournament Reset ──────────────────────────────────────────

export async function getThreadIdsForTournament(tournamentId) {
  const { data, error } = await db()
    .from('brackets')
    .select('discord_thread_id')
    .eq('tournament_id', tournamentId)
    .not('discord_thread_id', 'is', null);
  if (error) throw error;
  return data.map(r => r.discord_thread_id);
}

export async function resetTournament(tournamentId) {
  // score_reports must be deleted before brackets (FK constraint)
  await db().from('score_reports').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { error: bErr } = await db().from('brackets').delete().eq('tournament_id', tournamentId);
  if (bErr) throw bErr;
  const reset = { status: 'pending', started_at: null, ended_at: null };
  const { error: tErr } = await db().from('tournaments').update(reset).eq('id', tournamentId);
  if (tErr) throw tErr;
  const { error: aErr } = await db().from('active_tournament').update(reset).eq('id', tournamentId);
  if (aErr) throw aErr;
  // Reset bracket/eliminated/winner participants back to bracket for re-testing
  // Does NOT touch waitlist — those are real signups awaiting selection
  await db().from('participants')
    .update({ status: 'bracket', forfeit_advances: 0, flagged_for_review: false })
    .in('status', ['eliminated', 'winner', 'flagged']);
}

// ── Score Reports ─────────────────────────────────────────────

export async function insertScoreReport(report) {
  const { error } = await db().from('score_reports').insert(report);
  if (error) throw error;
}

export async function getScoreReports(bracketId) {
  const { data, error } = await db()
    .from('score_reports')
    .select('*')
    .eq('bracket_id', bracketId)
    .order('submitted_at');
  if (error) throw error;
  return data;
}

// ── Participants ── extended ──────────────────────────────────

export async function getParticipantById(id) {
  const { data, error } = await db().from('participants').select('*').eq('id', id).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data ?? null;
}

export async function incrementForfeitAdvances(participantId) {
  const p = await getParticipantById(participantId);
  if (!p) return null;
  const newCount = (p.forfeit_advances ?? 0) + 1;
  const { error } = await db().from('participants').update({ forfeit_advances: newCount }).eq('id', participantId);
  if (error) throw error;
  return newCount;
}

export async function isBanned(discordId) {
  const { data } = await db().from('cheaters').select('id').eq('discord_id', discordId).limit(1);
  return (data?.length ?? 0) > 0;
}

export async function banPlayer(discordId, fullName, tournamentId, reason) {
  const { error } = await db().from('cheaters').insert({ discord_id: discordId, full_name: fullName, tournament_id: tournamentId, reason });
  if (error) throw error;
}

// ── Discord linking ───────────────────────────────────────────

export async function getParticipantsNeedingDiscordCheck() {
  const { data, error } = await db()
    .from('participants')
    .select('id, discord_id')
    .not('discord_id', 'is', null)
    .eq('added_to_discord', false);
  if (error) throw error;
  return data ?? [];
}

export async function setAddedToDiscord(id, value) {
  const { error } = await db()
    .from('participants')
    .update({ added_to_discord: value })
    .eq('id', id);
  if (error) throw error;
}

export async function linkParticipantByPsn(psnId, discordId) {
  const { data, error } = await db()
    .from('participants')
    .update({ discord_id: discordId, added_to_discord: true })
    .ilike('psn_id', psnId)
    .select()
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data ?? null;
}

// ── Admin Reviews ─────────────────────────────────────────────

export async function createAdminReview(fields) {
  const { data, error } = await db().from('admin_reviews').insert(fields).select().single();
  if (error) throw error;
  return data;
}

export async function getAdminReview(matchId) {
  const { data, error } = await db().from('admin_reviews').select('*').eq('match_id', matchId).order('requested_at', { ascending: false }).limit(1).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data ?? null;
}

export async function updateAdminReview(id, fields) {
  const { error } = await db().from('admin_reviews').update(fields).eq('id', id);
  if (error) throw error;
}

// ── Bracket queries ── extended ───────────────────────────────

export async function getMatchById(id) {
  const { data, error } = await db()
    .from('brackets')
    .select(`*, participant_a:participant_a_id(id, name, psn_id, discord_id), participant_b:participant_b_id(id, name, psn_id, discord_id), winner:winner_id(id, name, psn_id)`)
    .eq('id', id)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data ?? null;
}

export async function getPreviousRoundLosers(tournamentId, roundNumber) {
  // Returns participants eliminated in rounds < roundNumber, sorted by goal_difference ASC
  const { data, error } = await db()
    .from('brackets')
    .select(`*, participant_a:participant_a_id(id, name, psn_id, discord_id, forfeit_advances), participant_b:participant_b_id(id, name, psn_id, discord_id, forfeit_advances)`)
    .eq('tournament_id', tournamentId)
    .lt('round_number', roundNumber)
    .eq('status', 'completed')
    .not('winner_id', 'is', null);
  if (error) throw error;

  const losers = [];
  for (const m of data ?? []) {
    const loser = m.winner_id === m.participant_a_id ? m.participant_b : m.participant_a;
    if (!loser || loser.forfeit_advances > 0) continue; // skip forfeitors
    const gd = (m.winner_id === m.participant_a_id)
      ? (m.score_b ?? 0) - (m.score_a ?? 0)
      : (m.score_a ?? 0) - (m.score_b ?? 0);
    losers.push({ ...loser, goal_difference: gd, goals_scored: m.winner_id === m.participant_a_id ? (m.score_b ?? 0) : (m.score_a ?? 0) });
  }
  losers.sort((a, b) => a.goal_difference - b.goal_difference || b.goals_scored - a.goals_scored || Math.random() - 0.5);
  return losers;
}
