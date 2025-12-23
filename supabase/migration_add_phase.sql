-- Migration to add phase column to games table
-- Run this in your Supabase SQL Editor if you have an existing database

-- Add phase column to games table
ALTER TABLE games
ADD COLUMN phase TEXT CHECK (phase IN ('waiting', 'showing_image', 'guessing', 'revealing')) DEFAULT 'waiting';

-- Update existing games to have appropriate phase based on status
UPDATE games
SET phase = CASE
  WHEN status = 'waiting' THEN 'waiting'
  WHEN status = 'playing' THEN 'guessing'
  WHEN status = 'finished' THEN 'waiting'
  ELSE 'waiting'
END;

