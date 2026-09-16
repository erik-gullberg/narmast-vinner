import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const range = (start: number, end: number, step: number) => {
  const out: number[] = []
  for (let v = start; v <= end; v += step) out.push(v)
  return out
}

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
const GRID_LINE_COLOR = 'rgba(79, 70, 229, 0.08)' // indigo-600, very faint
const RING_COLOR_RGB = '79, 70, 229' // indigo-600

// Map-graticule texture: a full latitude/longitude-style grid across the
// whole canvas, faint enough to read as paper texture rather than compete
// with the text. 1200x630 at a 100px step.
const GRID_LINES_X = range(100, 1100, 100)
const GRID_LINES_Y = range(90, 540, 90)

// Concentric "you are here" rings radiating from the logo pin's tip, in
// place of scattered decorative pins — ties the map motif directly to the
// one pin that's already the focal point, instead of adding new elements.
const TARGET_RINGS = [
  { radius: 50, opacity: 0.22 },
  { radius: 100, opacity: 0.14 },
  { radius: 150, opacity: 0.08 },
]

export default async function Image() {
  const [logoData, boldFont, regularFont] = await Promise.all([
    readFile(join(process.cwd(), 'public/logo.png')),
    readFile(join(process.cwd(), 'public/sj-sans-otf/sj-sans-bold.otf')),
    readFile(join(process.cwd(), 'public/sj-sans-otf/sj-sans-regular.otf')),
  ])
  const logoSrc = `data:image/png;base64,${logoData.toString('base64')}`

  // logo.png is 571x762 (portrait); scale it to the image height while
  // keeping that aspect ratio instead of hardcoding a guessed width.
  const logoHeight = 460
  const logoWidth = Math.round(logoHeight * (571 / 762))
  const logoLeft = 80 // matches the container's horizontal padding below
  const logoTop = (size.height - logoHeight) / 2 // container centers it vertically
  // Center of the ring motif: the pin's tip (bottom point), where a map pin's
  // coordinate actually is.
  const tipX = logoLeft + logoWidth / 2
  const tipY = logoTop + logoHeight

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

        {TARGET_RINGS.map((ring) => (
          <div
            key={ring.radius}
            style={{
              position: 'absolute',
              left: tipX - ring.radius,
              top: tipY - ring.radius,
              width: ring.radius * 2,
              height: ring.radius * 2,
              borderRadius: '50%',
              border: `3px solid rgba(${RING_COLOR_RGB}, ${ring.opacity})`,
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
