-- Add used_event_ids column to games table to track events used in each game session
ALTER TABLE games
ADD COLUMN used_event_ids UUID[] DEFAULT '{}';

-- Add comment to explain the column
COMMENT ON COLUMN games.used_event_ids IS 'Array of event IDs that have been used in this game session to ensure unique events per game';

