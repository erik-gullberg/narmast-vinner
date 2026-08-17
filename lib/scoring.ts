/**
 * Scoring.
 *
 * ⚠️  These formulas are duplicated in close_round() in
 *     supabase/migration_solo_and_scoring.sql. The database is authoritative —
 *     everything here exists purely so the UI can display the same numbers
 *     without a round trip. If you change one, change the other.
 */

export const HIGHSCORE_MAX_POINTS = 1000

/** Distance at which a guess is worth 1/e (~37%) of full marks. */
export const HIGHSCORE_FALLOFF_KM = 1000

/**
 * Points for a single guess in `highscore` mode.
 *
 * Previously `max(0, 1000 - km)`, which had a hard cliff: 999 km scored 1 point,
 * 1001 km scored 0, and being 1100 km out felt identical to being 11000 km out.
 * Replayed over 5045 real guesses, that scored 35.0% of them exactly zero.
 *
 * The exponential curve keeps the same ranking and the same maximum, but
 * degrades smoothly instead of falling off a cliff, so the whole plausible
 * range of guesses gets meaningful feedback:
 *
 *     0 km → 1000     300 km → 741     1000 km → 368
 *  2000 km →  135    5000 km →   7    10000 km →   0
 *
 * It does still round to 0 past roughly 7600 km, which is fine — that is a
 * guess on the wrong side of the planet. Replayed over the same 5045 real
 * guesses, zero-point guesses fall from 35.0% to 9.8%, and the median guess
 * goes from 573 to 653 points.
 */
export function highscorePoints(distanceKm: number): number {
  return Math.round(
    HIGHSCORE_MAX_POINTS * Math.exp(-distanceKm / HIGHSCORE_FALLOFF_KM)
  )
}

/** Points for a single guess, given the game mode and whether it was closest. */
export function pointsForGuess(
  gameMode: 'highscore' | 'closest_wins',
  distanceKm: number,
  isClosest: boolean
): number {
  if (gameMode === 'closest_wins') return isClosest ? 1 : 0
  return highscorePoints(distanceKm)
}
