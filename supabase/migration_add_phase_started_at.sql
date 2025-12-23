-- Add phase_started_at column to track when the guessing phase started
ALTER TABLE games ADD COLUMN phase_started_at TIMESTAMP WITH TIME ZONE;

-- Update existing games to set phase_started_at to now for those in guessing phase
UPDATE games SET phase_started_at = NOW() WHERE phase = 'guessing';

