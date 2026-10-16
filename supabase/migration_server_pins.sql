-- ============================================================================
-- Närmast Vinner — server-side pins: a placed pin always counts
-- ============================================================================
--
-- Before this, a pin that was placed but never confirmed with "Klar!" only
-- counted if the player's own browser sent it at the exact moment the
-- countdown hit zero. That misses when the device clock is more than the
-- 2 s grace slow (submit_guess rejects it), when a phone is locked or the tab
-- is backgrounded (timers are throttled), or when the connection is slow at
-- the deadline. Since 2026-09-14, 6% of player-rounds ended with no guess.
--
-- Now every pin placement is saved on the server (place_pin), and
-- close_round() turns unconfirmed pins into guesses before scoring. "Klar!"
-- just means "I'm done": it locks the guess in and lets the round end early.
--
-- Safe to run at any time: additive. The current frontend keeps working
-- (it simply never calls place_pin). Run this BEFORE deploying the frontend
-- that calls place_pin, or every pin placement will log an RPC error.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. pins — the latest unconfirmed pin per player per round
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pins (
  game_id    UUID NOT NULL REFERENCES games(id)   ON DELETE CASCADE,
  player_id  UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  round      INTEGER NOT NULL,
  latitude   DOUBLE PRECISION NOT NULL CHECK (latitude  BETWEEN -90  AND 90),
  longitude  DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game_id, player_id, round)
);

-- Server-only, like round_results. RLS on with no policies, plus an explicit
-- revoke because Supabase's default privileges grant new tables to anon.
-- Pins must never be readable by other players: that would leak guesses.
ALTER TABLE pins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pins FROM anon, authenticated;


-- ----------------------------------------------------------------------------
-- 2. place_pin — save (or move) the caller's pin for the current round
-- ----------------------------------------------------------------------------
-- Same window and membership checks as submit_guess. Called on every map
-- click; the client serialises calls so the last click is the one stored.
CREATE OR REPLACE FUNCTION place_pin(
  p_game_id   UUID,
  p_player_id UUID,
  p_lat       DOUBLE PRECISION,
  p_lon       DOUBLE PRECISION
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_game     games;
  v_lon      DOUBLE PRECISION;
  v_deadline TIMESTAMP WITH TIME ZONE;
BEGIN
  IF p_lat IS NULL OR p_lon IS NULL OR p_lat NOT BETWEEN -90 AND 90 THEN
    RAISE EXCEPTION 'Ogiltig position';
  END IF;

  -- Leaflet reports longitudes outside ±180 when the click lands on a wrapped
  -- copy of the world. Normalise rather than reject.
  v_lon := p_lon - 360 * floor((p_lon + 180) / 360);

  SELECT * INTO v_game FROM games WHERE id = p_game_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Spelet hittades inte';
  END IF;

  IF v_game.status <> 'playing' OR v_game.phase <> 'guessing' THEN
    RAISE EXCEPTION 'Det går inte att gissa just nu';
  END IF;

  PERFORM 1 FROM players WHERE id = p_player_id AND game_id = p_game_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Du är inte med i det här spelet';
  END IF;

  v_deadline := v_game.phase_started_at
              + make_interval(secs => COALESCE(v_game.guess_time_seconds, 15)
                                    + round_grace_seconds());
  IF NOW() > v_deadline THEN
    RAISE EXCEPTION 'Tiden är ute';
  END IF;

  INSERT INTO pins (game_id, player_id, round, latitude, longitude, updated_at)
  VALUES (p_game_id, p_player_id, v_game.current_round, p_lat, v_lon, NOW())
  ON CONFLICT (game_id, player_id, round) DO UPDATE
    SET latitude   = EXCLUDED.latitude,
        longitude  = EXCLUDED.longitude,
        updated_at = EXCLUDED.updated_at;
END;
$$;

GRANT EXECUTE ON FUNCTION place_pin(UUID, UUID, DOUBLE PRECISION, DOUBLE PRECISION)
  TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3. close_round — promote unconfirmed pins before scoring
-- ----------------------------------------------------------------------------
-- Identical to migration_solo_and_scoring.sql except for the promotion step.
--
-- Promotion runs after the "may we close?" check and before the exactly-once
-- claim, inside the same transaction as scoring, so the scorer always sees
-- the promoted guesses. A concurrent second caller promotes nothing new
-- (ON CONFLICT DO NOTHING) and then loses the claim.
--
-- A promoted guess takes the pin's updated_at as created_at, so the
-- closest_wins tie-break ("first to answer") uses when the pin was last
-- placed, not when the round happened to close.
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
  -- Unconfirmed pins deliberately do not count as answered here: a pin can
  -- still move, so only "Klar!" may end the round early.
  IF NOT v_all_guessed AND NOW() < v_deadline THEN
    RETURN;
  END IF;

  -- Promote every pin that was never confirmed with submit_guess.
  INSERT INTO guesses (game_id, player_id, event_id, latitude, longitude,
                       distance_km, round, created_at)
  SELECT pn.game_id, pn.player_id, e.id, pn.latitude, pn.longitude,
         haversine_km(pn.latitude, pn.longitude, e.latitude, e.longitude),
         pn.round, pn.updated_at
  FROM pins pn
  JOIN events e ON e.id = v_game.current_event_id
  WHERE pn.game_id = p_game_id AND pn.round = v_game.current_round
  ON CONFLICT (game_id, player_id, round) DO NOTHING;

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

  -- Pins have served their purpose once the round is scored.
  DELETE FROM pins WHERE game_id = p_game_id AND round = v_game.current_round;

  -- Stamping this here gives the reveal a server-synced start time.
  UPDATE games SET phase = 'revealing', phase_started_at = NOW() WHERE id = p_game_id;
END;
$$;


-- ----------------------------------------------------------------------------
-- 4. Verification
-- ----------------------------------------------------------------------------
-- After running, anon must not be able to read pins:
--
--   SET ROLE anon; SELECT * FROM pins; RESET ROLE;   -- expect permission denied
--
-- And the RPC must exist with the right grant:
--
--   SELECT has_function_privilege('anon',
--     'place_pin(uuid, uuid, double precision, double precision)', 'EXECUTE');
--   -- expect true
