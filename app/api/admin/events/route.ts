import { NextRequest, NextResponse } from 'next/server'
import {
  createServiceSupabaseClient,
  verifyAdminRequest,
} from '@/lib/adminAuth'
import { classifyRegion, type Region } from '@/lib/wikipedia'

export async function GET(req: NextRequest) {
  const authError = verifyAdminRequest(req)
  if (authError) return authError

  try {
    const supabase = createServiceSupabaseClient()
    const { data, error } = await supabase
      .from('events')
      .select('id, title, image_url, latitude, longitude, year, image_ok')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const events = data ?? []
    const regionCounts: Record<Region, number> = {
      Europa: 0,
      Nordamerika: 0,
      Sydamerika: 0,
      Asien: 0,
      Afrika: 0,
      Oceanien: 0,
      Övrigt: 0,
    }

    for (const ev of events) {
      const r = classifyRegion(ev.latitude, ev.longitude)
      regionCounts[r] = (regionCounts[r] ?? 0) + 1
    }

    return NextResponse.json({
      events,
      total: events.length,
      regionCounts,
    })
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Kunde inte hämta händelser.',
      },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const authError = verifyAdminRequest(req)
  if (authError) return authError

  try {
    const body = await req.json()
    const title = String(body.title ?? '').trim()
    const description = String(body.description ?? '').trim()
    const image_url = String(body.image_url ?? '').trim()
    const latitude = Number(body.latitude)
    const longitude = Number(body.longitude)
    const year = Number(body.year)

    if (!title || !description || !image_url) {
      return NextResponse.json(
        { error: 'Titel, beskrivning och bild-URL måste vara ifyllda.' },
        { status: 400 }
      )
    }

    if (
      Number.isNaN(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      Number.isNaN(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      return NextResponse.json(
        { error: 'Ogiltiga koordinater (latitud -90..90, longitud -180..180).' },
        { status: 400 }
      )
    }

    if (!Number.isInteger(year) || year < -3000 || year > 2100) {
      return NextResponse.json(
        { error: 'Ange ett giltigt årtal (heltal).' },
        { status: 400 }
      )
    }

    const supabase = createServiceSupabaseClient()
    const { data, error } = await supabase
      .from('events')
      .insert({
        title,
        description,
        image_url,
        latitude,
        longitude,
        year,
        image_ok: true,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ event: data })
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Kunde inte spara händelsen.',
      },
      { status: 500 }
    )
  }
}
