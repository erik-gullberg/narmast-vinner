-- ============================================================================
-- Närmast Vinner — Batch 2: solo mode, auto-advance, exponential scoring
-- ============================================================================
--
--   §6.1  solo mode — 65% of games (275 of 426) had exactly one player, but the
--         game was built as a host-driven party game
--   §6.3  scoring curve — 32% of all 5035 real guesses scored exactly 0 points
--         under max(0, 1000 - km)
--   §6.4  auto-advance — 42% of started games died within 2 rounds
--
-- Safe to run at any time: additive, and the frontend keeps working before and
-- after. Unlike the previous migration there is no breaking second part.
--
-- Run this BEFORE deploying the matching frontend.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. auto_advance
-- ----------------------------------------------------------------------------
-- When true the host's client drives the phase transitions on a timer instead
-- of waiting for a button press. Always on for solo games (where "waiting for
-- the host" means waiting for yourself), opt-in for multiplayer.
ALTER TABLE games ADD COLUMN IF NOT EXISTS auto_advance BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN games.auto_advance IS
  'Host client auto-advances showing_image -> guessing -> next round on a timer.';


-- ----------------------------------------------------------------------------
-- 2. Exponential scoring + reveal timestamp
-- ----------------------------------------------------------------------------
-- Two changes to close_round():
--
--   a) highscore points become 1000 * exp(-km / 1000) instead of
--      max(0, 1000 - km).
--
--      The old formula had a hard cliff at 1000 km: 999 km scored 1 point and
--      1001 km scored 0, and a player 1100 km out got exactly the same feedback
--      as one 11000 km out. Replayed over 5045 real guesses it scored 35.0% of
--      them exactly zero; the new curve scores only 9.8% zero and lifts the
--      median guess from 573 to 653 points. Same ranking, same 1000 maximum:
--
--          0 km -> 1000    300 km -> 741    1000 km -> 368
--       2000 km ->  135   5000 km ->   7  10000 km ->   0
--
--      Mirrored in lib/scoring.ts. Keep the two in sync.
--
--   b) phase_started_at is now stamped when the round closes, so the reveal
--      countdown is server-synced across clients rather than each client
--      timing its own. It also resets the 90s stall detector at the moment a
--      round ends, which is the correct behaviour.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION close_round(p_game_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_game        games;
  v_players     INTEGER;
  v_guesses     INTEGER;
  v_deadline    TIMESTAMP WITH TIME ZONE;
  v_all_guessed BOOLEAN;
  v_claimed     INTEGER;
BEGIN
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Spelet hittades inte';
  END IF;

  IF v_game.status <> 'playing' OR v_game.phase <> 'guessing' THEN
    RETURN; -- already closed by another client
  END IF;

  SELECT COUNT(*) INTO v_players FROM players WHERE game_id = p_game_id;
  SELECT COUNT(*) INTO v_guesses
  FROM guesses WHERE game_id = p_game_id AND round = v_game.current_round;

  v_all_guessed := v_players > 0 AND v_guesses >= v_players;

  v_deadline := v_game.phase_started_at
              + make_interval(secs => COALESCE(v_game.guess_time_seconds, 15)
                                    + round_grace_seconds());

  -- Refuse to close early unless everyone has actually answered. This is what
  -- stops a client with a fast clock from cutting the round short for others.
  IF NOT v_all_guessed AND NOW() < v_deadline THEN
    RETURN;
  END IF;

  -- Exactly-once claim.
  INSERT INTO round_results (game_id, round)
  VALUES (p_game_id, v_game.current_round)
  ON CONFLICT (game_id, round) DO NOTHING;

  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed = 0 THEN
    -- Someone already scored this round; just make sure the phase is right.
    UPDATE games SET phase = 'revealing' WHERE id = p_game_id AND phase = 'guessing';
    RETURN;
  END IF;

  IF v_game.game_mode = 'closest_wins' THEN
    -- Exactly one point, to exactly one player, exactly once.
    UPDATE players SET score = score + 1
    WHERE id = (
      SELECT player_id FROM guesses
      WHERE game_id = p_game_id AND round = v_game.current_round
      ORDER BY distance_km ASC, created_at ASC
      LIMIT 1
    );
  ELSE
    -- highscore: exponential falloff, atomic increment per player.
    UPDATE players p SET score = p.score + sub.points
    FROM (
      SELECT player_id,
             ROUND(1000 * exp(-(distance_km::DOUBLE PRECISION) / 1000.0))::INTEGER AS points
      FROM guesses
      WHERE game_id = p_game_id AND round = v_game.current_round
    ) sub
    WHERE p.id = sub.player_id;
  END IF;

  -- Stamping this here gives the reveal a server-synced start time.
  UPDATE games SET phase = 'revealing', phase_started_at = NOW() WHERE id = p_game_id;
END;
$$;


-- ----------------------------------------------------------------------------
-- 3. Verification
-- ----------------------------------------------------------------------------
-- Expected point values on the new curve:
--
--   SELECT km, ROUND(1000 * exp(-km / 1000.0))::INTEGER AS points
--   FROM (VALUES (0),(100),(300),(500),(1000),(2000),(5000),(10000)) AS t(km);
--
--     km    | points
--   --------+--------
--        0  |   1000
--      100  |    905
--      300  |    741
--      500  |    607
--     1000  |    368
--     2000  |    135
--     5000  |      7
--    10000  |      0
