-- ============================================================================
-- Närmast Vinner — auto-advance toggle
-- ============================================================================
--
-- auto_advance was previously set once at creation time (lib/createGame.ts)
-- and could not be changed mid-game. The host — or the sole player in a
-- solo game — can now flip it from Spelkontroller while playing.
--
-- games has no direct UPDATE grant for anon/authenticated (see
-- migration_critical_fixes_part_b.sql), so this needs its own RPC rather than
-- a plain .update() from the client. Depends on can_control_game(), added in
-- migration_critical_fixes.sql.
--
-- Safe to run at any time: additive only.
-- ============================================================================

CREATE OR REPLACE FUNCTION set_auto_advance(
  p_game_id   UUID,
  p_player_id UUID,
  p_enabled   BOOLEAN
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_game games;
BEGIN
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Spelet hittades inte';
  END IF;

  IF NOT can_control_game(v_game, p_player_id) THEN
    RAISE EXCEPTION 'Endast värden kan ändra automatiskt spelflöde';
  END IF;

  UPDATE games SET auto_advance = p_enabled WHERE id = p_game_id;
END;
$$;

GRANT EXECUTE ON FUNCTION set_auto_advance(UUID, UUID, BOOLEAN) TO anon, authenticated;
