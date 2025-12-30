-- Migration: Add unique constraint for player names within a game
-- This prevents multiple players from having the same name in the same game

-- Add unique constraint on (game_id, name) combination
-- Using LOWER(name) to make it case-insensitive
CREATE UNIQUE INDEX unique_player_name_per_game ON players (game_id, LOWER(name));

