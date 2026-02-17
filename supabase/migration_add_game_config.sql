-- Add game configuration columns to games table
ALTER TABLE games
ADD COLUMN game_mode TEXT DEFAULT 'highscore' CHECK (game_mode IN ('highscore', 'closest_wins')),
ADD COLUMN max_rounds INTEGER,
ADD COLUMN target_score INTEGER,
ADD COLUMN guess_time_seconds INTEGER DEFAULT 15;

-- Add comment to describe the columns
COMMENT ON COLUMN games.game_mode IS 'Game mode: highscore (all players score based on distance) or closest_wins (only closest player scores)';
COMMENT ON COLUMN games.max_rounds IS 'Maximum number of rounds. NULL means unlimited (marathon mode)';
COMMENT ON COLUMN games.target_score IS 'Target score for closest_wins mode. NULL means unlimited';
COMMENT ON COLUMN games.guess_time_seconds IS 'Time in seconds for guessing phase. Default 15';

