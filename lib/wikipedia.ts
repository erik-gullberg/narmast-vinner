import { calculateDistance } from './utils.ts'

export type Region =
  | 'Europa'
  | 'Nordamerika'
  | 'Sydamerika'
  | 'Asien'
  | 'Afrika'
  | 'Oceanien'
  | 'Övrigt'

export type DiscoveryRegionFilter =
  | 'non_europe'
  | 'asia'
  | 'africa'
  | 'south_america'
  | 'north_america'
  | 'oceania'
  | 'europe'
  | 'all'

export type DiscoveryCategory =
  | 'events'
  | 'disasters'
  | 'landmarks'
  | 'unesco'
  | 'sports_culture'

export interface CandidateEvent {
  /** Stable identifier (Wikidata QID or wiki lang:title) */
  id: string
  title: string
  description: string
  image_url: string
  alternate_images: string[]
  latitude: number | null
  longitude: number | null
  year: number | null
  region: Region
  source_url: string
  sitelinks?: number
}

export interface ExistingEventSummary {
  id?: string
  title: string
  image_url: string
  latitude: number
  longitude: number
  year: number
}

const USER_AGENT =
  'NarmastVinner-Admin/1.0 (+https://xn--nrmastvinner-bfb.se; contact@erikgullberg.se)'

/**
 * Coarse bounding-box continent classifier matching the breakdown in
 * IMPROVEMENTS.md §1.5 so the admin header can track geographic balance.
 */
export function classifyRegion(lat: number | null, lon: number | null): Region {
  if (lat === null || lon === null || Number.isNaN(lat) || Number.isNaN(lon)) {
    return 'Övrigt'
  }
  // Europe (including Iceland, excluding most of Asian Russia/Turkey east of 40E)
  if (lat >= 35 && lat <= 72 && lon >= -25 && lon <= 40) return 'Europa'
  // Africa
  if (lat >= -36 && lat < 37 && lon >= -20 && lon <= 52) return 'Afrika'
  // Oceania (Australia, NZ, Pacific islands)
  if (lat >= -50 && lat <= 0 && lon >= 110 && lon <= 180) return 'Oceanien'
  if (lat >= -30 && lat <= 25 && lon >= -180 && lon <= -130) return 'Oceanien'
  // South America
  if (lat >= -56 && lat <= 13 && lon >= -82 && lon <= -34) return 'Sydamerika'
  // North & Central America + Caribbean + Greenland
  if (lat > 7 && lat <= 84 && lon >= -170 && lon <= -10) return 'Nordamerika'
  // Asia
  if (lat >= -11 && lat <= 78 && lon > 26 && lon <= 180) return 'Asien'

  return 'Övrigt'
}

/**
 * Parse a Wikipedia URL into { lang, title }.
 */
export function parseWikipediaUrl(url: string): { lang: string; title: string } {
  const urlPattern = /https?:\/\/([a-z-]+)\.wikipedia\.org\/wiki\/([^#?]+)/i
  const match = url.trim().match(urlPattern)

  if (!match) {
    throw new Error(
      'Ogiltig Wikipedia-URL. Förväntat format: https://sv.wikipedia.org/wiki/Artikelnamn'
    )
  }

  const [, lang, encodedTitle] = match
  const title = decodeURIComponent(encodedTitle)
  return { lang: lang.toLowerCase(), title }
}

/**
 * Filter out non-photographic or spoiler-heavy Wikimedia files (maps, flags,
 * icons, SVG diagrams, coats of arms, locator maps).
 */
export function isUsableEventImage(url: string): boolean {
  if (!url) return false
  const lower = url.toLowerCase()

  // Must be HTTPS and not an SVG/GIF/TIFF/PDF/audio/video file
  if (!lower.startsWith('https://')) return false
  if (/\.(svg|gif|tif|tiff|pdf|ogg|ogv|webm)(\?|$)/i.test(lower)) return false
  if (lower.includes('.svg.png')) return false

  // Reject obvious maps, flags, logos, coats of arms, and UI icons
  const bannedTokens = [
    'locator',
    'location_map',
    'map_of',
    'karta',
    'flag_of',
    'flagga',
    'coat_of_arms',
    'stadsvapen',
    'vapen',
    'logo',
    'symbol',
    'icon',
    'commons-logo',
    'wikidata-logo',
    'question_book',
    'ambox',
    'disambig',
    'red_pog',
    'blue_pog',
    'relief_map',
    'orthographic',
    'signature',
    'autograph',
  ]

  return !bannedTokens.some((token) => lower.includes(token))
}

/**
 * Extract a plausible 3- or 4-digit year from a Swedish or English text extract,
 * or from a Wikidata ISO timestamp (e.g. "+1989-11-09T00:00:00Z").
 */
export function parseWikidataYear(dateValue?: string | null): number | null {
  if (!dateValue) return null
  // Wikidata negative or positive ISO date: +1986-04-26T00:00:00Z or -0044-03-15...
  const match = dateValue.match(/^([+-]?\d{1,4})-\d{2}-\d{2}/)
  if (!match) return null
  const year = parseInt(match[1], 10)
  if (Number.isNaN(year) || year <= 0 || year > new Date().getFullYear()) {
    return null
  }
  return year
}

export function extractYearFromText(text: string): number | null {
  if (!text) return null
  const currentYear = new Date().getFullYear()
  // Match 4-digit years between 1000 and currentYear (or 3-digit years preceded by "år ")
  const fourDigit = text.match(/\b(1\d{3}|20\d{2})\b/g)
  if (fourDigit) {
    for (const candidate of fourDigit) {
      const y = parseInt(candidate, 10)
      if (y >= 1000 && y <= currentYear) return y
    }
  }
  const explicitYear = text.match(/\bår\s+(\d{3,4})\b/i)
  if (explicitYear) {
    const y = parseInt(explicitYear[1], 10)
    if (y > 0 && y <= currentYear) return y
  }
  return null
}

/**
 * Strip tracking query parameters (such as `?utm_source=sv.wikipedia.org&utm_campaign=imageinfo`)
 * that MediaWiki's `imageinfo` API appends to `upload.wikimedia.org` URLs.
 */
export function cleanImageUrl(url: string): string {
  if (!url) return ''
  const trimmed = url.trim().replace(/^http:\/\//i, 'https://')
  if (trimmed.startsWith('https://upload.wikimedia.org/')) {
    return trimmed.split('?')[0]
  }
  return trimmed
}

/**
 * Normalize an image URL to its base Wikimedia filename so thumbnails and
 * originals of the same file are recognized as duplicates.
 */
export function normalizeImageFilename(url: string): string {
  if (!url) return ''
  const cleaned = cleanImageUrl(url)
  try {
    const decoded = decodeURIComponent(cleaned)
    const parts = decoded.split('/')
    const last = parts[parts.length - 1] || ''
    return last.replace(/^\d+px-/, '').toLowerCase().trim()
  } catch {
    return cleaned.toLowerCase().trim()
  }
}

/**
 * Checks whether a candidate is already present in the database's `events`
 * list (by normalized title, same Wikimedia file, or within 0.5 km + same year).
 */
export function isDuplicateEvent(
  candidate: Pick<
    CandidateEvent,
    'title' | 'image_url' | 'latitude' | 'longitude' | 'year'
  >,
  existing: ExistingEventSummary[]
): boolean {
  const normTitle = candidate.title.trim().toLowerCase()
  const normImg = normalizeImageFilename(candidate.image_url)

  for (const ev of existing) {
    if (ev.title.trim().toLowerCase() === normTitle) return true
    if (normImg && normalizeImageFilename(ev.image_url) === normImg) return true
    if (
      candidate.latitude !== null &&
      candidate.longitude !== null &&
      candidate.year !== null &&
      ev.year === candidate.year
    ) {
      const dist = calculateDistance(
        candidate.latitude,
        candidate.longitude,
        ev.latitude,
        ev.longitude
      )
      if (dist < 0.5) return true
    }
  }
  return false
}

/**
 * Trim a multi-sentence Wikipedia summary down to the first 1–2 concise sentences
 * suitable for the post-round reveal card.
 */
export function trimDescription(text: string, maxSentences: number = 2): string {
  if (!text) return ''
  const cleaned = text.replace(/\s+/g, ' ').trim()
  // Split on sentence boundaries (. ! ?) followed by space and uppercase letter
  const sentences = cleaned.split(/(?<=[.!?])\s+(?=[A-ZÅÄÖ0-9])/)
  return sentences.slice(0, maxSentences).join(' ')
}

async function wikiFetch(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  })
}

/**
 * Given a language and page title, checks if there is a corresponding Swedish
 * Wikipedia (`sv`) article title.
 */
async function resolveSwedishTitle(
  lang: string,
  title: string
): Promise<string | null> {
  if (lang === 'sv') return title
  const apiUrl =
    `https://${lang}.wikipedia.org/w/api.php?` +
    new URLSearchParams({
      action: 'query',
      titles: title,
      prop: 'langlinks',
      lllang: 'sv',
      format: 'json',
    }).toString()

  const res = await wikiFetch(apiUrl)
  if (!res.ok) return null
  const data = await res.json()
  const pages = data?.query?.pages
  if (!pages) return null
  const firstPage = Object.values(pages)[0] as any
  return firstPage?.langlinks?.[0]?.['*'] ?? null
}

/**
 * Fetch summary, coordinates, and usable article images from Wikipedia.
 * Automatically prefers the Swedish title/extract if an interwiki link exists,
 * while pooling images and coordinates from both `sv` and the original language.
 */
export async function fetchWikipediaCandidate(
  url: string
): Promise<CandidateEvent> {
  const { lang, title } = parseWikipediaUrl(url)

  const svTitle = await resolveSwedishTitle(lang, title)
  const primaryLang = svTitle ? 'sv' : lang
  const primaryTitle = svTitle ?? title

  const [primarySummary, fallbackSummary, primaryDetails, fallbackDetails] =
    await Promise.all([
      fetchSummary(primaryLang, primaryTitle),
      primaryLang !== lang ? fetchSummary(lang, title) : Promise.resolve(null),
      fetchPageDetails(primaryLang, primaryTitle),
      primaryLang !== lang
        ? fetchPageDetails(lang, title)
        : Promise.resolve(null),
    ])

  const summary = primarySummary ?? fallbackSummary
  if (!summary) {
    throw new Error(`Kunde inte hämta Wikipedia-artikeln "${title}"`)
  }

  const coords =
    primaryDetails?.coords ??
    fallbackDetails?.coords ??
    (summary.coordinates
      ? { lat: summary.coordinates.lat, lon: summary.coordinates.lon }
      : null)

  // Collect unique usable images: lead image first, then article images
  const allImages: string[] = []
  const seenFiles = new Set<string>()
  const pushImg = (imgUrl?: string | null) => {
    const cleaned = cleanImageUrl(imgUrl ?? '')
    if (!cleaned || !isUsableEventImage(cleaned)) return
    const key = normalizeImageFilename(cleaned)
    if (!key || seenFiles.has(key)) return
    seenFiles.add(key)
    allImages.push(cleaned)
  }

  pushImg(summary.originalimage?.source ?? summary.thumbnail?.source)
  pushImg(fallbackSummary?.originalimage?.source ?? fallbackSummary?.thumbnail?.source)
  for (const img of primaryDetails?.images ?? []) pushImg(img)
  for (const img of fallbackDetails?.images ?? []) pushImg(img)

  const extract = summary.extract || summary.description || ''
  const year =
    extractYearFromText(extract) ??
    extractYearFromText(fallbackSummary?.extract || '')

  const lat = coords?.lat ?? null
  const lon = coords?.lon ?? null

  return {
    id: `${primaryLang}:${primaryTitle}`,
    title: summary.title || primaryTitle,
    description: trimDescription(extract, 2) || extract,
    image_url: allImages[0] ?? '',
    alternate_images: allImages,
    latitude: lat,
    longitude: lon,
    year,
    region: classifyRegion(lat, lon),
    source_url: `https://${primaryLang}.wikipedia.org/wiki/${encodeURIComponent(
      primaryTitle.replace(/ /g, '_')
    )}`,
  }
}

interface RestSummary {
  title: string
  extract?: string
  description?: string
  thumbnail?: { source: string }
  originalimage?: { source: string }
  coordinates?: { lat: number; lon: number }
}

async function fetchSummary(
  lang: string,
  title: string
): Promise<RestSummary | null> {
  const encoded = encodeURIComponent(title.replace(/ /g, '_'))
  const res = await wikiFetch(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`
  )
  if (!res.ok) return null
  return res.json()
}

async function fetchPageDetails(
  lang: string,
  title: string
): Promise<{
  coords: { lat: number; lon: number } | null
  images: string[]
} | null> {
  const params = new URLSearchParams({
    action: 'query',
    titles: title,
    prop: 'coordinates|images',
    imlimit: '20',
    format: 'json',
  })

  const res = await wikiFetch(
    `https://${lang}.wikipedia.org/w/api.php?${params.toString()}`
  )
  if (!res.ok) return null
  const data = await res.json()
  const pages = data?.query?.pages
  if (!pages) return null
  const page = Object.values(pages)[0] as any
  if (!page) return null

  const c = page.coordinates?.[0]
  const coords =
    c && typeof c.lat === 'number' && typeof c.lon === 'number'
      ? { lat: c.lat, lon: c.lon }
      : null

  const rawImageTitles: string[] = (page.images ?? [])
    .map((img: any) => img?.title as string)
    .filter(Boolean)
    .filter((t: string) => !/\.(svg|gif|tif|tiff|ogg|webm)$/i.test(t))
    .slice(0, 12)

  let images: string[] = []
  if (rawImageTitles.length > 0) {
    const infoParams = new URLSearchParams({
      action: 'query',
      titles: rawImageTitles.join('|'),
      prop: 'imageinfo',
      iiprop: 'url',
      format: 'json',
    })
    const infoRes = await wikiFetch(
      `https://${lang}.wikipedia.org/w/api.php?${infoParams.toString()}`
    )
    if (infoRes.ok) {
      const infoData = await infoRes.json()
      const infoPages = infoData?.query?.pages ?? {}
      images = Object.values(infoPages)
        .map((p: any) => cleanImageUrl(p?.imageinfo?.[0]?.url as string))
        .filter((u): u is string => Boolean(u) && isUsableEventImage(u))
    }
  }

  return { coords, images }
}

/**
 * Build a Wikidata SPARQL query for items that:
 *  - belong to the chosen category (historical events, disasters, landmarks, UNESCO, sports/culture)
 *  - have coordinates (P625) in the chosen geographic region
 *  - have a lead image (P18)
 *  - have a date (P585 point in time, P580 start time, or P571 inception)
 *  - have an article on Swedish Wikipedia (`sv.wikipedia.org`) so Swedish players know it
 *  - have high global sitelink count (fame filter)
 */
function buildSparqlQuery(
  category: DiscoveryCategory,
  regionFilter: DiscoveryRegionFilter,
  limit: number,
  offset: number
): string {
  const categoryValues: Record<DiscoveryCategory, string> = {
    // Historical events, battles, protests, treaties, revolutions, spaceflights/landings
    events: 'wd:Q13418847 wd:Q178561 wd:Q273120 wd:Q124734 wd:Q625298',
    // Disasters: earthquakes, volcanic eruptions, nuclear accidents, shipwrecks, aviation accidents, explosions
    disasters: 'wd:Q7944 wd:Q7692360 wd:Q168983 wd:Q852190 wd:Q744913 wd:Q3839081',
    // Famous landmarks: bridges, towers, skyscrapers, statues, palaces, amphitheatres, archaeological sites
    landmarks: 'wd:Q12280 wd:Q12518 wd:Q11303 wd:Q179700 wd:Q16560 wd:Q839954',
    // UNESCO World Heritage Sites & national parks
    unesco: 'wd:Q9259 wd:Q46169',
    // Olympic Games, World Cups, festivals, concerts, stadiums
    sports_culture: 'wd:Q159821 wd:Q1151733 wd:Q868557 wd:Q483110',
  }

  const regionClauses: Record<DiscoveryRegionFilter, string> = {
    non_europe: 'FILTER(?lat < 35 || ?lat > 72 || ?lon < -25 || ?lon > 40)',
    asia: 'FILTER(?lat >= -11 && ?lat <= 70 && ?lon > 40 && ?lon <= 180)',
    africa: 'FILTER(?lat >= -36 && ?lat < 36 && ?lon >= -20 && ?lon <= 52)',
    south_america: 'FILTER(?lat >= -56 && ?lat <= 13 && ?lon >= -82 && ?lon <= -34)',
    north_america: 'FILTER(?lat > 7 && ?lat <= 75 && ?lon >= -170 && ?lon <= -50)',
    oceania: 'FILTER(?lat >= -50 && ?lat <= 0 && ?lon >= 110 && ?lon <= 180)',
    europe: 'FILTER(?lat >= 35 && ?lat <= 72 && ?lon >= -25 && ?lon <= 40)',
    all: '',
  }

  const minSitelinks = category === 'events' || category === 'disasters' ? 18 : 25

  return `
SELECT DISTINCT ?item ?svArticle ?image ?lat ?lon ?date ?sitelinks WHERE {
  VALUES ?type { ${categoryValues[category]} }
  ?item wdt:P31 ?type ;
        wdt:P18 ?image ;
        p:P625 ?coordStmt ;
        wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${minSitelinks})
  ?coordStmt psv:P625 ?coordNode .
  ?coordNode wikibase:geoLatitude ?lat ;
             wikibase:geoLongitude ?lon .
  ${regionClauses[regionFilter]}
  OPTIONAL { ?item wdt:P585 ?d1 . }
  OPTIONAL { ?item wdt:P580 ?d2 . }
  OPTIONAL { ?item wdt:P571 ?d3 . }
  BIND(COALESCE(?d1, ?d2, ?d3) AS ?date)
  FILTER(BOUND(?date))
  ?svArticle schema:about ?item ;
             schema:isPartOf <https://sv.wikipedia.org/> .
}
ORDER BY DESC(?sitelinks)
LIMIT ${Math.min(limit, 25)}
OFFSET ${Math.max(0, offset)}
`.trim()
}

/**
 * Query Wikidata + Swedish Wikipedia for fresh event candidates.
 */
export async function discoverWikipediaCandidates(options: {
  category: DiscoveryCategory
  region: DiscoveryRegionFilter
  limit?: number
  offset?: number
}): Promise<CandidateEvent[]> {
  const limit = options.limit ?? 12
  const offset = options.offset ?? 0
  const sparql = buildSparqlQuery(
    options.category,
    options.region,
    limit,
    offset
  )

  const url =
    'https://query.wikidata.org/sparql?' +
    new URLSearchParams({ query: sparql, format: 'json' }).toString()

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/sparql-results+json',
    },
  })

  if (!res.ok) {
    throw new Error(`Wikidata svarade med status ${res.status}`)
  }

  const data = await res.json()
  const bindings: any[] = data?.results?.bindings ?? []

  // Deduplicate by Wikidata item URI (an item may have multiple P18 or dates)
  const uniqueRows: any[] = []
  const seenItems = new Set<string>()
  for (const row of bindings) {
    const itemUri = row.item?.value
    const imgUrl = cleanImageUrl(row.image?.value || '')
    if (!itemUri || seenItems.has(itemUri) || !isUsableEventImage(imgUrl)) {
      continue
    }
    seenItems.add(itemUri)
    uniqueRows.push(row)
  }

  // Enrich with Swedish Wikipedia summary & alternate images in small batches
  const candidates: CandidateEvent[] = []
  for (const row of uniqueRows) {
    const svUrl: string | undefined = row.svArticle?.value
    if (!svUrl) continue
    try {
      const { title } = parseWikipediaUrl(svUrl)
      const [summary, details] = await Promise.all([
        fetchSummary('sv', title),
        fetchPageDetails('sv', title),
      ])

      const wikidataImg = cleanImageUrl(row.image?.value || '')
      const allImages: string[] = []
      const seenFiles = new Set<string>()
      const addImg = (u?: string | null) => {
        const cleaned = cleanImageUrl(u ?? '')
        if (!cleaned || !isUsableEventImage(cleaned)) return
        const k = normalizeImageFilename(cleaned)
        if (!k || seenFiles.has(k)) return
        seenFiles.add(k)
        allImages.push(cleaned)
      }

      addImg(summary?.originalimage?.source ?? summary?.thumbnail?.source)
      addImg(wikidataImg)
      for (const img of details?.images ?? []) addImg(img)

      if (allImages.length === 0) continue

      const lat = parseFloat(row.lat?.value)
      const lon = parseFloat(row.lon?.value)
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue

      const extract = summary?.extract || summary?.description || ''
      const year =
        parseWikidataYear(row.date?.value) ?? extractYearFromText(extract)

      candidates.push({
        id: row.item?.value?.split('/').pop() || `sv:${title}`,
        title: summary?.title || title,
        description: trimDescription(extract, 2) || extract,
        image_url: allImages[0],
        alternate_images: allImages,
        latitude: lat,
        longitude: lon,
        year,
        region: classifyRegion(lat, lon),
        source_url: svUrl,
        sitelinks: parseInt(row.sitelinks?.value ?? '0', 10) || undefined,
      })
    } catch {
      // Skip individual failed page enrichments
    }
  }

  return candidates
}
