import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Generated at build time (no route params here, so Next emits one static
// PNG) and wired into <head> automatically as og:image / og:image:width /
// og:image:height / og:image:type / og:image:alt. Reading local files needs
// the Node runtime — the default Edge runtime for this convention can only
// fetch remote URLs, and the site isn't deployed yet when this runs.
export const runtime = 'nodejs'

export const alt =
  'Närmast Vinner – gissa var händelser och platser inträffade på kartan och utmana dina vänner'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Brand values duplicated from app/page.tsx and tailwind.config.ts: Satori
// (the renderer behind ImageResponse) only understands inline styles, not
// Tailwind classes, so the gradient/colors/font can't be shared by import.
const GRADIENT_FROM = '#eff6ff' // blue-50
const GRADIENT_TO = '#e0e7ff' // indigo-100
const TITLE_COLOR = '#1f2937' // gray-800
const TAGLINE_COLOR = '#4b5563' // gray-600
const GRID_LINE_COLOR = 'rgba(99, 102, 241, 0.15)' // indigo-500, faint

// Real in-game marker pins (public/markers/), scattered as decoration to read
// as "guesses on a map" rather than a generic logo card. Native size is
// 50x82 (2x). Excludes red (reserved for the answer pin — see lib/colors.ts)
// and grey/black (too dull to read at LinkedIn's small preview size).
const PIN_COLORS = ['blue', 'gold', 'green', 'orange', 'violet', 'yellow'] as const
const PIN_NATIVE_WIDTH = 50
const PIN_NATIVE_HEIGHT = 82
const PIN_WIDTH = 34
const PIN_HEIGHT = Math.round(PIN_WIDTH * (PIN_NATIVE_HEIGHT / PIN_NATIVE_WIDTH))

// Positions sit inside two horizontal bands (y 0-75 and y 555-630) that stay
// clear of the centered logo (y 85-545) and text block (y ~226-404) at every
// x, so pins can't visually collide with the readable content.
const DECORATIVE_PINS: { color: (typeof PIN_COLORS)[number]; x: number; y: number; rotate: number }[] = [
  { color: 'blue', x: 50, y: 8, rotate: -14 },
  { color: 'gold', x: 340, y: 12, rotate: 10 },
  { color: 'green', x: 1090, y: 6, rotate: 12 },
  { color: 'orange', x: 140, y: 566, rotate: 8 },
  { color: 'violet', x: 560, y: 562, rotate: -10 },
  { color: 'yellow', x: 990, y: 568, rotate: -6 },
]

// Map-graticule texture: evenly spaced hairlines, not a literal map, so it
// reads as "this is a map game" without needing real coastline data.
const GRID_LINES_X = [300, 600, 900]
const GRID_LINES_Y = [160, 320, 480]

export default async function Image() {
  const [logoData, boldFont, regularFont, ...pinBuffers] = await Promise.all([
    readFile(join(process.cwd(), 'public/logo.png')),
    readFile(join(process.cwd(), 'public/sj-sans-otf/sj-sans-bold.otf')),
    readFile(join(process.cwd(), 'public/sj-sans-otf/sj-sans-regular.otf')),
    ...PIN_COLORS.map((color) =>
      readFile(join(process.cwd(), `public/markers/marker-icon-2x-${color}.png`))
    ),
  ])
  const logoSrc = `data:image/png;base64,${logoData.toString('base64')}`
  const pinSrc = Object.fromEntries(
    PIN_COLORS.map((color, i) => [
      color,
      `data:image/png;base64,${pinBuffers[i].toString('base64')}`,
    ])
  ) as Record<(typeof PIN_COLORS)[number], string>

  // logo.png is 571x762 (portrait); scale it to the image height while
  // keeping that aspect ratio instead of hardcoding a guessed width.
  const logoHeight = 460
  const logoWidth = Math.round(logoHeight * (571 / 762))

  return new ImageResponse(
    (
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(135deg, ${GRADIENT_FROM} 0%, ${GRADIENT_TO} 100%)`,
          padding: '0 80px',
        }}
      >
        {GRID_LINES_Y.map((y) => (
          <div
            key={`h-${y}`}
            style={{
              position: 'absolute',
              left: 0,
              top: y,
              width: '100%',
              height: 1,
              backgroundColor: GRID_LINE_COLOR,
            }}
          />
        ))}
        {GRID_LINES_X.map((x) => (
          <div
            key={`v-${x}`}
            style={{
              position: 'absolute',
              top: 0,
              left: x,
              width: 1,
              height: '100%',
              backgroundColor: GRID_LINE_COLOR,
            }}
          />
        ))}

        {DECORATIVE_PINS.map((pin) => (
          <img
            key={`${pin.color}-${pin.x}`}
            src={pinSrc[pin.color]}
            width={PIN_WIDTH}
            height={PIN_HEIGHT}
            style={{
              position: 'absolute',
              left: pin.x,
              top: pin.y,
              transform: `rotate(${pin.rotate}deg)`,
              opacity: 0.85,
            }}
          />
        ))}

        <img
          src={logoSrc}
          width={logoWidth}
          height={logoHeight}
          style={{ marginRight: 64 }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            maxWidth: 600,
          }}
        >
          <div
            style={{
              fontFamily: 'SJ Sans',
              fontWeight: 700,
              fontSize: 64,
              lineHeight: 1.1,
              color: TITLE_COLOR,
            }}
          >
            Närmast Vinner
          </div>
          <div
            style={{
              fontFamily: 'SJ Sans',
              fontWeight: 400,
              fontSize: 30,
              lineHeight: 1.4,
              color: TAGLINE_COLOR,
              marginTop: 24,
            }}
          >
            Gissa var händelser och platser inträffade på kartan &amp; utmana
            dina vänner!
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'SJ Sans', data: boldFont, weight: 700, style: 'normal' },
        { name: 'SJ Sans', data: regularFont, weight: 400, style: 'normal' },
      ],
    }
  )
}
