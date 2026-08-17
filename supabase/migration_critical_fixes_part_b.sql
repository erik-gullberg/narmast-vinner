-- ============================================================================
-- Närmast Vinner — Critical fixes, PART B: revoke direct write access (§3.2)
-- ============================================================================
--
--   ⚠️  BREAKING. Run this ONLY after:
--         1. migration_critical_fixes.sql (PART A) has been applied
--         2. the new frontend is deployed
--         3. you have played a full game end to end successfully
--
--   Any client still running the old code will break the moment this runs.
--
-- ----------------------------------------------------------------------------
-- Why revokes and not RLS policies:
--
-- This app has no auth. Every client uses the same public anon key, so
-- auth.uid() is always NULL and an RLS policy can only ever evaluate to
-- true or false — there is no way to express "only this player may update
-- this row". Rewriting the policies would therefore accomplish nothing.
--
-- Instead we remove write privileges entirely and force all writes through the
-- SECURITY DEFINER functions in PART A, which validate phase, membership,
-- timing and ownership before touching anything.
--
-- Note this raises the bar substantially but is not airtight: host_id and
-- player ids are publicly readable, so a determined player could still pass
-- someone else's UUID to an RPC. Closing that requires real identity —
-- see "Full Supabase Anonymous Auth" in IMPROVEMENTS.md §3.2.
-- ============================================================================

-- Was: anyone could vandalise the shared event pool that every game draws from.
-- Imports now run with the service-role key from the admin tooling instead.
REVOKE INSERT, UPDATE, DELETE ON events        FROM anon, authenticated;

-- Was: anyone could `UPDATE players SET score = 999999`.
-- Colour changes now go through set_player_color().
REVOKE UPDATE, DELETE         ON players       FROM anon, authenticated;

-- Was: anyone could change any game's phase, current event or status.
-- All transitions now go through start_game/begin_guessing/advance_round/end_game.
REVOKE UPDATE, DELETE         ON games         FROM anon, authenticated;

-- Was: anyone could insert a guess with distance_km = 0 and win every round.
-- Distance is now computed server-side in submit_guess().
REVOKE INSERT, UPDATE, DELETE ON guesses       FROM anon, authenticated;

-- Scoring ledger. Only close_round() may write here.
REVOKE INSERT, UPDATE, DELETE ON round_results FROM anon, authenticated;

-- Deliberately NOT revoked, so create/page.tsx and join/page.tsx keep working
-- without changes:
--   INSERT ON games
--   INSERT ON players
-- Game-creation spam is a lesser risk, tracked separately in IMPROVEMENTS.md.


-- ============================================================================
-- Verification — every one of these should now be denied.
-- ============================================================================
-- Run in the SQL editor:
--
--   SET ROLE anon;
--
--   UPDATE players SET score = 999999
--     WHERE id = (SELECT id FROM players LIMIT 1);
--   -- expected: ERROR permission denied for table players
--
--   INSERT INTO events (title, description, image_url, latitude, longitude, year)
--     VALUES ('vandal','x','https://example.com/x.png', 0, 0, 2000);
--   -- expected: ERROR permission denied for table events
--
--   UPDATE games SET status = 'finished'
--     WHERE id = (SELECT id FROM games LIMIT 1);
--   -- expected: ERROR permission denied for table games
--
--   RESET ROLE;
--
-- Reads should all still work (realtime depends on them):
--
--   SET ROLE anon;
--   SELECT count(*) FROM games;    -- expected: succeeds
--   SELECT count(*) FROM players;  -- expected: succeeds
--   SELECT count(*) FROM guesses;  -- expected: succeeds
--   SELECT count(*) FROM events;   -- expected: succeeds
--   RESET ROLE;
-- ============================================================================
