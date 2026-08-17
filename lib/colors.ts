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

// Marker images are self-hosted in public/markers/.
// They used to be hotlinked from raw.githubusercontent.com, which is not a CDN,
// is rate limited, and would have silently broken every pin on the map.
export const MARKER_ICON_PATH = '/markers';
export const MARKER_SHADOW_URL = `${MARKER_ICON_PATH}/marker-shadow.png`;

// Single source of truth for colors, so the map pins, the polylines and the
// scoreboard dots can never drift apart.
const COLOR_HEX: Record<string, string> = {
  blue: '#2A81CB',
  red: '#CB2B3E',
  green: '#2AAD27',
  orange: '#CB8427',
  yellow: '#CAC428',
  violet: '#9C2BCB',
  grey: '#7B7B7B',
  black: '#3D3D3D',
  gold: '#FFD326',
};

const DEFAULT_HEX = COLOR_HEX.blue;

// Get hex color for map polylines and swatches
export const getHexColor = (color: string): string =>
  COLOR_HEX[color] ?? DEFAULT_HEX;

// Get background color style for a color (inline styles, since the color is dynamic)
export const getColorStyle = (color: string): { backgroundColor: string } => ({
  backgroundColor: getHexColor(color),
});

// Create a Leaflet icon for a player color (client-side only)
export const createPlayerIcon = (color: string) => {
  // Leaflet touches `window` on import, so bail out during SSR
  if (typeof window === 'undefined') {
    return null;
  }

  const safeColor = color in COLOR_HEX ? color : 'blue';

  const L = require('leaflet');
  return new L.Icon({
    iconUrl: `${MARKER_ICON_PATH}/marker-icon-2x-${safeColor}.png`,
    shadowUrl: MARKER_SHADOW_URL,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });
};

// Patches Leaflet's default icon, which otherwise tries to load images from a
// relative path that does not exist in a bundled Next.js app.
export const fixLeafletDefaultIcon = async () => {
  const L = await import('leaflet');
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: `${MARKER_ICON_PATH}/marker-icon-2x-blue.png`,
    iconUrl: `${MARKER_ICON_PATH}/marker-icon-2x-blue.png`,
    shadowUrl: MARKER_SHADOW_URL,
  });
};

// Get an available color not yet used by other players
export const getAvailableColor = (usedColors: string[]): string => {
  const availableColors = PLAYER_COLORS.filter((c) => !usedColors.includes(c));
  if (availableColors.length > 0) {
    return availableColors[0];
  }
  // If all colors are used, return a random one
  return PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
};
