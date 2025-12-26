-- Add color column to players table
ALTER TABLE players ADD COLUMN color TEXT DEFAULT 'blue';

-- Add constraint to ensure valid colors (matching leaflet-color-markers)
ALTER TABLE players ADD CONSTRAINT players_color_check
  CHECK (color IN ('blue', 'gold', 'red', 'green', 'orange', 'yellow', 'violet', 'grey', 'black'));

