// Shared CARTO basemap config. Single source of truth so MapComponent.tsx
// and Results.tsx cannot drift again (they already had once).
//
// Style is deliberately "light_nolabels", not "voyager" or any labelled
// style — place labels would give away the answer to the guessing game.
//
// The key is a public usage identifier, not a secret: tiles are fetched
// directly by the browser, so it is visible in devtools regardless of how
// it's wired up. NEXT_PUBLIC_ is correct here, not a shortcut.
const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_KEY

if (!CARTO_KEY && process.env.NODE_ENV !== 'production') {
  console.warn(
    '[basemap] NEXT_PUBLIC_CARTO_KEY is not set — CARTO will serve watermarked tiles. ' +
      'See .env.local.example.'
  )
}

export const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
  '&copy; <a href="https://carto.com/attributions">CARTO</a>'

export const BASEMAP_URL =
  'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png' +
  (CARTO_KEY ? `?key=${CARTO_KEY}` : '')
