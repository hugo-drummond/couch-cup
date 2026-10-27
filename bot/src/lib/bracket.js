/**
 * Generates a single-elimination bracket from a list of participants.
 * Participants are randomly seeded for v1 (no manual seeding).
 * Returns an array of match objects ready to insert into couchcup.brackets.
 */
export function generateBracket(tournamentId, participants) {
  const n = participants.length;
  if (n < 2 || (n & (n - 1)) !== 0) {
    throw new Error(`Participant count must be a power of 2 (4, 8, 16, 32). Got ${n}`);
  }

  const shuffled = [...participants].sort(() => Math.random() - 0.5);
  const matches = [];
  const totalRounds = Math.log2(n);

  // Round 1: pair all participants
  for (let i = 0; i < n / 2; i++) {
    matches.push({
      tournament_id:    tournamentId,
      round_number:     1,
      position:         i + 1,
      participant_a_id: shuffled[i * 2].id,
      participant_b_id: shuffled[i * 2 + 1].id,
      status:           'pending',
    });
  }

  // Pre-create empty slots for rounds 2..totalRounds so advanceWinner can UPDATE them
  for (let round = 2; round <= totalRounds; round++) {
    const count = n / Math.pow(2, round);
    for (let pos = 1; pos <= count; pos++) {
      matches.push({
        tournament_id: tournamentId,
        round_number:  round,
        position:      pos,
        status:        'pending',
      });
    }
  }

  return matches;
}

/**
 * Returns the round name for display purposes.
 */
export function roundName(roundNumber, totalRounds = 5) {
  if (roundNumber === totalRounds)     return 'Grand Final';
  if (roundNumber === totalRounds - 1) return 'Semi-Finals';
  if (roundNumber === totalRounds - 2) return 'Quarter-Finals';
  return `Round ${roundNumber}`;
}
