-- Run these SQL commands in your Supabase SQL Editor
-- Supabase Database Schema for Närmast Vinner

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Games table
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  code TEXT NOT NULL UNIQUE,
  host_id UUID NOT NULL,
  current_round INTEGER DEFAULT 0,
  status TEXT CHECK (status IN ('waiting', 'playing', 'finished')) DEFAULT 'waiting',
  current_event_id UUID
);

-- Players table
CREATE TABLE players (
  id UUID PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  score INTEGER DEFAULT 0
);

-- Events table
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  year INTEGER NOT NULL
);

-- Guesses table
CREATE TABLE guesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  distance_km DECIMAL(10, 2) NOT NULL,
  round INTEGER NOT NULL
);

-- Indexes for better performance
CREATE INDEX idx_games_code ON games(code);
CREATE INDEX idx_players_game_id ON players(game_id);
CREATE INDEX idx_guesses_game_id ON guesses(game_id);
CREATE INDEX idx_guesses_player_id ON guesses(player_id);
CREATE INDEX idx_guesses_round ON guesses(game_id, round);

-- Enable Row Level Security (RLS)
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE guesses ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Games: Anyone can read, anyone can create, only host can update
CREATE POLICY "Games are viewable by everyone"
  ON games FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create a game"
  ON games FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Only host can update game"
  ON games FOR UPDATE
  USING (true);

-- Players: Anyone can read, anyone can join, players can update their own data
CREATE POLICY "Players are viewable by everyone"
  ON players FOR SELECT
  USING (true);

CREATE POLICY "Anyone can join a game"
  ON players FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Players can update their own data"
  ON players FOR UPDATE
  USING (true);

-- Events: Everyone can read, only authenticated users can insert
CREATE POLICY "Events are viewable by everyone"
  ON events FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert events"
  ON events FOR INSERT
  WITH CHECK (true);

-- Guesses: Players can read guesses for their game, players can insert their own guesses
CREATE POLICY "Guesses are viewable by players in the game"
  ON guesses FOR SELECT
  USING (true);

CREATE POLICY "Players can submit guesses"
  ON guesses FOR INSERT
  WITH CHECK (true);

-- Enable Realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE events;
ALTER PUBLICATION supabase_realtime ADD TABLE guesses;

