-- ============================================================================
-- Närmast Vinner — Critical fixes: server-authoritative game state
-- ============================================================================
--
-- Fixes:
--   §2.1  closest_wins awarded 1..N points instead of 1 (ran on every client)
--   §2.2  no way to submit early; every round burned the full clock
--   §2.3  client clock skew changed the effective guess window
--   §2.4  no duplicate-guess protection
--   §3.2  anon could update any score / any game / insert any event
--   §3.3  distance_km was computed in the browser and therefore forgeable
--   §4.2  host closing the tab left the game stuck in `playing` forever
--   §4.4  the `revealing` phase existed but was never used
--   §5.2  event picking was an N+1 + serial HEAD requests from the host browser
--
-- ============================================================================
-- RUN ORDER — IMPORTANT
--
--   1. Run PART A.
--   2. Deploy the frontend.
--   3. Verify a full game works end to end.
--   4. Run PART B.
--
-- Between steps 1 and 4 both the old and new frontend keep working.
-- PART B revokes direct table writes and will break any client still running
-- the old code.
-- ============================================================================


-- ============================================================================
-- PART A — additive. Safe to run at any time.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A1. Data integrity
-- ----------------------------------------------------------------------------

-- One guess per player per round. Verified clean: 0 duplicates across all
-- 5035 existing rows, so this applies without any data cleanup.
CREATE UNIQUE INDEX IF NOT EXISTS guesses_one_per_round
  ON guesses (game_id, player_id, round);

-- Coordinate sanity. Verified clean: all 102 existing events pass.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_lat_valid;
ALTER TABLE events ADD CONSTRAINT events_lat_valid
  CHECK (latitude BETWEEN -90 AND 90);

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_lon_valid;
ALTER TABLE events ADD CONSTRAINT events_lon_valid
  CHECK (longitude BETWEEN -180 AND 180);

-- Replaces the per-round HEAD request that used to run in the host's browser.
-- Maintained out of band by .github/workflows/keepalive.yml.
ALTER TABLE events ADD COLUMN IF NOT EXISTS image_ok BOOLEAN NOT NULL DEFAULT TRUE;

-- Speeds up the random event pick in advance_round().
CREATE INDEX IF NOT EXISTS idx_events_image_ok ON events (image_ok) WHERE image_ok;


-- ----------------------------------------------------------------------------
-- A2. Once-only round scoring guard
-- ----------------------------------------------------------------------------
-- The primary key is the mechanism that makes scoring exactly-once. Any number
-- of clients may call close_round() concurrently; only the one that wins the
-- INSERT awards points.
CREATE TABLE IF NOT EXISTS round_results (
  game_id   UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round     INTEGER NOT NULL,
  scored_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game_id, round)
);

ALTER TABLE round_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Round results are viewable by everyone" ON round_results;
CREATE POLICY "Round results are viewable by everyone"
  ON round_results FOR SELECT USING (true);


-- ----------------------------------------------------------------------------
-- A3. Helpers
-- ----------------------------------------------------------------------------

-- Great-circle distance in kilometres. Mirrors lib/utils.ts:calculateDistance
-- so that client-side previews and server-side truth agree.
CREATE OR REPLACE FUNCTION haversine_km(
  lat1 DOUBLE PRECISION, lon1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION, lon2 DOUBLE PRECISION
) RETURNS DOUBLE PRECISION
LANGUAGE SQL IMMUTABLE PARALLEL SAFE AS $$
  SELECT 6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians(lon2 - lon1) / 2), 2)
  ));
$$;

-- Seconds of slack allowed for in-flight requests and minor clock skew.
-- Replaces the old blanket 5 second client-side buffer, and only costs
-- anything when a round actually times out.
CREATE OR REPLACE FUNCTION round_grace_seconds() RETURNS INTEGER
LANGUAGE SQL IMMUTABLE PARALLEL SAFE AS $$ SELECT 2 $$;

-- A game counts as stalled when nothing has advanced it for 90 seconds.
-- This is what lets a game survive the host closing their tab (§4.2).
CREATE OR REPLACE FUNCTION game_is_stalled(g games) RETURNS BOOLEAN
LANGUAGE SQL STABLE AS $$
  SELECT NOW() - COALESCE(g.phase_started_at, g.created_at) > INTERVAL '90 seconds';
$$;

-- Authorises a host-level action: either you are the host, or the game has
-- stalled and anyone may rescue it.
CREATE OR REPLACE FUNCTION can_control_game(g games, p_player_id UUID) RETURNS BOOLEAN
LANGUAGE SQL STABLE AS $$
  SELECT g.host_id = p_player_id OR game_is_stalled(g);
$$;


-- ----------------------------------------------------------------------------
-- A4. start_game
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION start_game(p_game_id UUID, p_player_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_game     games;
  v_event_id UUID;
  v_players  INTEGER;
BEGIN
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Spelet hittades inte';
  END IF;

  IF v_game.status <> 'waiting' THEN
    RETURN; -- already started; treat as a no-op so double clicks are harmless
  END IF;

  IF v_game.host_id <> p_player_id THEN
    RAISE EXCEPTION 'Endast värden kan starta spelet';
  END IF;

  SELECT COUNT(*) INTO v_players FROM players WHERE game_id = p_game_id;
  IF v_players = 0 THEN
    RAISE EXCEPTION 'Det finns inga spelare i spelet';
  END IF;

  SELECT id INTO v_event_id
  FROM events WHERE image_ok
  ORDER BY random() LIMIT 1;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Det finns inga tillgängliga platser';
  END IF;

  UPDATE games SET
    status           = 'playing',
    current_round    = 1,
    current_event_id = v_event_id,
    phase            = 'showing_image',
    phase_started_at = NOW(),
    used_event_ids   = ARRAY[v_event_id]
  WHERE id = p_game_id;
END;
$$;


-- ----------------------------------------------------------------------------
-- A5. begin_guessing
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION begin_guessing(p_game_id UUID, p_player_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_game games;
BEGIN
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Spelet hittades inte';
  END IF;

  IF v_game.phase <> 'showing_image' THEN
    RETURN; -- idempotent
  END IF;

  IF NOT can_control_game(v_game, p_player_id) THEN
    RAISE EXCEPTION 'Endast värden kan starta gissningen';
  END IF;

  -- phase_started_at is the authoritative start of the guess window.
  UPDATE games SET phase = 'guessing', phase_started_at = NOW()
  WHERE id = p_game_id;
END;
$$;


-- ----------------------------------------------------------------------------
-- A6. submit_guess  (§2.2, §2.4, §3.3)
-- ----------------------------------------------------------------------------
-- Distance is computed here, not in the browser, so it cannot be forged.
CREATE OR REPLACE FUNCTION submit_guess(
  p_game_id   UUID,
  p_player_id UUID,
  p_lat       DOUBLE PRECISION,
  p_lon       DOUBLE PRECISION
) RETURNS DOUBLE PRECISION
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_game     games;
  v_event    events;
  v_distance DOUBLE PRECISION;
  v_deadline TIMESTAMP WITH TIME ZONE;
BEGIN
  IF p_lat IS NULL OR p_lon IS NULL
     OR p_lat NOT BETWEEN -90 AND 90
     OR p_lon NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Ogiltig position';
  END IF;

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

  -- Server owns the clock, so a skewed or patched client cannot buy extra time.
  v_deadline := v_game.phase_started_at
              + make_interval(secs => COALESCE(v_game.guess_time_seconds, 15)
                                    + round_grace_seconds());
  IF NOW() > v_deadline THEN
    RAISE EXCEPTION 'Tiden är ute';
  END IF;

  SELECT * INTO v_event FROM events WHERE id = v_game.current_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Platsen hittades inte';
  END IF;

  v_distance := haversine_km(p_lat, p_lon, v_event.latitude, v_event.longitude);

  -- guesses_one_per_round makes a second submission a silent no-op (§2.4).
  INSERT INTO guesses (game_id, player_id, event_id, latitude, longitude, distance_km, round)
  VALUES (p_game_id, p_player_id, v_event.id, p_lat, p_lon, v_distance, v_game.current_round)
  ON CONFLICT (game_id, player_id, round) DO NOTHING;

  -- Return what is actually stored, not what was just computed. On a duplicate
  -- submission those differ, and returning the computed value would report a
  -- distance for a guess that was never recorded.
  SELECT distance_km INTO v_distance
  FROM guesses
  WHERE game_id = p_game_id AND player_id = p_player_id AND round = v_game.current_round;

  RETURN v_distance;
END;
$$;


-- ----------------------------------------------------------------------------
-- A7. close_round  (§2.1 — the headline bug)
-- ----------------------------------------------------------------------------
-- Safe to call from every client simultaneously. Two independent guards:
--   1. FOR UPDATE on games serialises concurrent callers
--   2. the round_results primary key makes the award exactly-once
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
    -- highscore: atomic increment per player, no read-modify-write.
    UPDATE players p SET score = p.score + sub.points
    FROM (
      SELECT player_id, GREATEST(0, ROUND(1000 - distance_km))::INTEGER AS points
      FROM guesses
      WHERE game_id = p_game_id AND round = v_game.current_round
    ) sub
    WHERE p.id = sub.player_id;
  END IF;

  UPDATE games SET phase = 'revealing' WHERE id = p_game_id;
END;
$$;


-- ----------------------------------------------------------------------------
-- A8. advance_round  (§4.2, §5.2)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION advance_round(p_game_id UUID, p_player_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_game     games;
  v_event_id UUID;
  v_top      INTEGER;
BEGIN
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Spelet hittades inte';
  END IF;

  IF v_game.status <> 'playing' THEN
    RETURN;
  END IF;

  IF NOT can_control_game(v_game, p_player_id) THEN
    RAISE EXCEPTION 'Endast värden kan starta nästa runda';
  END IF;

  -- Round limit reached.
  IF v_game.max_rounds IS NOT NULL AND v_game.current_round >= v_game.max_rounds THEN
    UPDATE games SET status = 'finished' WHERE id = p_game_id;
    RETURN;
  END IF;

  -- Target score reached (closest_wins).
  IF v_game.game_mode = 'closest_wins' AND v_game.target_score IS NOT NULL THEN
    SELECT MAX(score) INTO v_top FROM players WHERE game_id = p_game_id;
    IF COALESCE(v_top, 0) >= v_game.target_score THEN
      UPDATE games SET status = 'finished' WHERE id = p_game_id;
      RETURN;
    END IF;
  END IF;

  -- One indexed query instead of the old N+1 plus serial HEAD requests.
  -- NOT (id = ANY(...)) is also empty-array safe, unlike the old `in ()`.
  SELECT id INTO v_event_id
  FROM events
  WHERE image_ok
    AND NOT (id = ANY(COALESCE(v_game.used_event_ids, ARRAY[]::UUID[])))
  ORDER BY random() LIMIT 1;

  IF v_event_id IS NULL THEN
    UPDATE games SET status = 'finished' WHERE id = p_game_id; -- pool exhausted
    RETURN;
  END IF;

  UPDATE games SET
    current_round    = v_game.current_round + 1,
    current_event_id = v_event_id,
    phase            = 'showing_image',
    phase_started_at = NOW(),
    used_event_ids   = COALESCE(used_event_ids, ARRAY[]::UUID[]) || v_event_id
  WHERE id = p_game_id;
END;
$$;


-- ----------------------------------------------------------------------------
-- A9. end_game
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION end_game(p_game_id UUID, p_player_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_game games;
BEGIN
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Spelet hittades inte';
  END IF;

  IF NOT can_control_game(v_game, p_player_id) THEN
    RAISE EXCEPTION 'Endast värden kan avsluta spelet';
  END IF;

  UPDATE games SET status = 'finished' WHERE id = p_game_id;
END;
$$;


-- ----------------------------------------------------------------------------
-- A10. set_player_color
-- ----------------------------------------------------------------------------
-- Needed because PART B revokes UPDATE on players (which is how score
-- tampering was possible).
CREATE OR REPLACE FUNCTION set_player_color(p_player_id UUID, p_color TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_game_id UUID;
  v_status  TEXT;
BEGIN
  IF p_color NOT IN ('blue','gold','green','orange','yellow','violet','grey','black') THEN
    RAISE EXCEPTION 'Ogiltig färg';
  END IF;

  SELECT game_id INTO v_game_id FROM players WHERE id = p_player_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Spelaren hittades inte';
  END IF;

  SELECT status INTO v_status FROM games WHERE id = v_game_id;
  IF v_status <> 'waiting' THEN
    RAISE EXCEPTION 'Färgen kan bara ändras innan spelet startar';
  END IF;

  PERFORM 1 FROM players
  WHERE game_id = v_game_id AND color = p_color AND id <> p_player_id;
  IF FOUND THEN
    RAISE EXCEPTION 'Färgen är redan tagen';
  END IF;

  UPDATE players SET color = p_color WHERE id = p_player_id;
END;
$$;


-- ----------------------------------------------------------------------------
-- A11. Execute grants
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION start_game(UUID, UUID)                                TO anon, authenticated;
GRANT EXECUTE ON FUNCTION begin_guessing(UUID, UUID)                            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION submit_guess(UUID, UUID, DOUBLE PRECISION, DOUBLE PRECISION) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION close_round(UUID)                                     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION advance_round(UUID, UUID)                             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION end_game(UUID, UUID)                                  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION set_player_color(UUID, TEXT)                          TO anon, authenticated;


-- ============================================================================
-- PART A ends here.
--
-- Next: deploy the frontend, verify a full game, then run
--       supabase/migration_critical_fixes_part_b.sql
-- ============================================================================
