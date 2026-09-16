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

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(135deg, ${GRADIENT_FROM} 0%, ${GRADIENT_TO} 100%)`,
          padding: '0 80px',
        }}
      >
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
