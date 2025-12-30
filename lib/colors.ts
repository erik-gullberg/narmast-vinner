// Available colors for players
// These exactly match the available colors in leaflet-color-markers repository
// Note: Red is reserved for the answer pin, so it's not available for players
export const PLAYER_COLORS = [
  'blue',
  'gold',
  'green',
  'orange',
  'yellow',
  'violet',
  'grey',
  'black',
] as const;

// Get background color style for a color (use inline styles for dynamic colors)
// Using exact colors from leaflet-color-markers to match the map pins
export const getColorStyle = (color: string): { backgroundColor: string } => {
  switch (color) {
    case 'blue': return { backgroundColor: '#2A81CB' };
    case 'red': return { backgroundColor: '#CB2B3E' };
    case 'green': return { backgroundColor: '#2AAD27' };
    case 'orange': return { backgroundColor: '#CB8427' };
    case 'yellow': return { backgroundColor: '#CAC428' };
    case 'violet': return { backgroundColor: '#9C2BCB' };
    case 'grey': return { backgroundColor: '#7B7B7B' };
    case 'black': return { backgroundColor: '#3D3D3D' };
    case 'gold': return { backgroundColor: '#FFD326' };
    default: return { backgroundColor: '#2A81CB' };
  }
};

// Get hex color for map polylines (using leaflet-color-markers colors)
export const getHexColor = (color: string): string => {
  switch (color) {
    case 'blue': return '#2A81CB';
    case 'red': return '#CB2B3E';
    case 'green': return '#2AAD27';
    case 'orange': return '#CB8427';
    case 'yellow': return '#CAC428';
    case 'violet': return '#9C2BCB';
    case 'grey': return '#7B7B7B';
    case 'black': return '#3D3D3D';
    case 'gold': return '#FFD326';
    default: return '#2A81CB';
  }
};

// Create a Leaflet icon for a player color (client-side only)
export const createPlayerIcon = (color: string) => {
  // Import Leaflet dynamically to avoid SSR issues
  if (typeof window === 'undefined') {
    return null;
  }

  const L = require('leaflet');
  return new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });
};

// Get an available color not yet used by other players
export const getAvailableColor = (usedColors: string[]): string => {
  const availableColors = PLAYER_COLORS.filter(c => !usedColors.includes(c));
  if (availableColors.length > 0) {
    return availableColors[0];
  }
  // If all colors are used, return a random one
  return PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
};

