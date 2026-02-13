import type { Metadata, Viewport } from 'next'
import './globals.css'

const siteUrl = 'https://xn--nrmastvinner-bfb.se'

export const metadata: Metadata = {
  title: 'Närmast Vinner - Multiplayer kartspel ',
  description: 'Närmast Vinner - inspirerat av momentet i På Spåret. Gratis & multiplayer.',
  keywords: [
    'närmast vinner',
    'narmast vinner',
    'på spåret',
    'geografispel',
    'kartspel',
    'gissa på kartan',
    'multiplayer spel',
    'svenska spel',
    'geografi quiz',
    'geoguessr alternativ',
    'spela med vänner',
    'gratis spel',
    'historiska händelser',
  ],
  authors: [{ name: 'Närmast Vinner' }],
  creator: 'Närmast Vinner',
  publisher: 'Närmast Vinner',
  metadataBase: new URL(siteUrl),
  icons: {
    icon: '/favicon.ico',
  },
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'sv_SE',
    url: siteUrl,
    siteName: 'Närmast Vinner',
    title: 'Närmast Vinner - Geografispel med vänner',
    description: 'Gissa var historiska händelser inträffade på kartan. Utmana dina vänner och se vem som kommer närmast!',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Närmast Vinner - Geografispel med vänner',
    description: 'Gissa var historiska händelser inträffade på kartan. Utmana dina vänner!',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

// JSON-LD structured data for rich search results
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Närmast Vinner',
  alternateName: ['Narmast Vinner', 'Närmast vinner'],
  description: 'Ett roligt geografispel där du gissar var historiska händelser inträffade på kartan. Spela med vänner i realtid!',
  url: siteUrl,
  applicationCategory: 'GameApplication',
  genre: 'Geography Game',
  inLanguage: 'sv',
  isAccessibleForFree: true,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="sv">
      <head>
        <meta name="google-site-verification" content="gzbShoeup-jVwg9k6IpL2qiaC_8OOrx4dtTLAysShwI" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}

