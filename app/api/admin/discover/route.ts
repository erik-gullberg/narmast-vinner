import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminRequest } from '@/lib/adminAuth'
import { CURATED_GLOBAL_SEEDS } from '@/lib/curatedCandidates'
import {
  classifyRegion,
  discoverWikipediaCandidates,
  fetchWikipediaCandidate,
  type CandidateEvent,
  type DiscoveryCategory,
  type DiscoveryRegionFilter,
} from '@/lib/wikipedia'

export async function POST(req: NextRequest) {
  const authError = verifyAdminRequest(req)
  if (authError) return authError

  try {
    const body = await req.json()
    const mode: 'urls' | 'starter' | 'wikidata' = body.mode || 'starter'

    if (mode === 'urls') {
      const urls: string[] = Array.isArray(body.urls) ? body.urls : []
      if (urls.length === 0) {
        return NextResponse.json(
          { error: 'Ange minst en Wikipedia-URL.' },
          { status: 400 }
        )
      }

      const candidates: CandidateEvent[] = []
      const errors: string[] = []

      for (const rawUrl of urls.slice(0, 15)) {
        try {
          const cand = await fetchWikipediaCandidate(rawUrl)
          candidates.push(cand)
        } catch (err) {
          errors.push(
            `${rawUrl}: ${err instanceof Error ? err.message : 'Fel'}`
          )
        }
      }

      return NextResponse.json({ candidates, errors })
    }

    if (mode === 'starter') {
      const offset = Math.max(0, Number(body.offset ?? 0))
      const limit = Math.min(12, Math.max(1, Number(body.limit ?? 10)))
      const slice = CURATED_GLOBAL_SEEDS.slice(offset, offset + limit)

      const candidates: CandidateEvent[] = []
      for (const seed of slice) {
        try {
          const cand = await fetchWikipediaCandidate(seed.url)
          const lat = cand.latitude ?? seed.fallbackLat
          const lon = cand.longitude ?? seed.fallbackLon
          const year = cand.year ?? seed.fallbackYear
          if (!cand.image_url) continue
          candidates.push({
            ...cand,
            latitude: lat,
            longitude: lon,
            year,
            region: classifyRegion(lat, lon),
          })
        } catch {
          // Skip failed seed
        }
      }

      return NextResponse.json({
        candidates,
        nextOffset: offset + slice.length,
        hasMore: offset + slice.length < CURATED_GLOBAL_SEEDS.length,
      })
    }

    // mode === 'wikidata'
    const category: DiscoveryCategory = body.category || 'events'
    const region: DiscoveryRegionFilter = body.region || 'non_europe'
    const offset = Math.max(0, Number(body.offset ?? 0))
    const limit = Math.min(20, Math.max(1, Number(body.limit ?? 12)))

    const candidates = await discoverWikipediaCandidates({
      category,
      region,
      limit,
      offset,
    })

    return NextResponse.json({
      candidates,
      nextOffset: offset + limit,
      hasMore: candidates.length > 0,
    })
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Kunde inte hämta förslag från Wikipedia/Wikidata.',
      },
      { status: 500 }
    )
  }
}
