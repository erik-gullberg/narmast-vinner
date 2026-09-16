// Single source of truth for the production domain. Punycode for "närmastvinner.se".
// Do not hardcode this elsewhere — layout.tsx and sitemap.ts both import it so the
// canonical URL, Open Graph tags, JSON-LD, and sitemap can never drift out of sync
// with each other again (they previously did: see git history on app/layout.tsx).
export const SITE_URL = 'https://xn--nrmastvinner-gcb.se'
