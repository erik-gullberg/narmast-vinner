/**
 * Supabase keepalive + event image health check.
 *
 * Run by .github/workflows/keepalive.yml every 3 days.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY because PART B of
 * supabase/migration_critical_fixes.sql revokes write access to events from
 * the anon role. Store it as a repository secret; never commit it.
 */

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

/** Some hosts reject HEAD but allow a ranged GET, so fall back before failing. */
async function imageIsReachable(url) {
  const attempt = async (init) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const res = await fetch(url, { ...init, signal: controller.signal })
      return res.ok
    } catch {
      return false
    } finally {
      clearTimeout(timeout)
    }
  }

  if (await attempt({ method: 'HEAD' })) return true
  return attempt({ method: 'GET', headers: { Range: 'bytes=0-1023' } })
}

async function main() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/events?select=id,title,image_url,image_ok`,
    { headers }
  )

  if (!res.ok) {
    console.error(`Failed to fetch events: ${res.status} ${await res.text()}`)
    process.exit(1)
  }

  const events = await res.json()
  console.log(`Checking ${events.length} events...`)

  const changed = []

  // Small concurrency cap so we do not hammer Wikimedia and get rate limited,
  // which is what caused the image loading problems in the first place.
  const CONCURRENCY = 5
  for (let i = 0; i < events.length; i += CONCURRENCY) {
    const batch = events.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map(async (event) => ({
        event,
        ok: await imageIsReachable(event.image_url),
      }))
    )

    for (const { event, ok } of results) {
      if (ok !== event.image_ok) {
        changed.push({ id: event.id, title: event.title, image_ok: ok })
      }
    }
  }

  const broken = changed.filter((c) => !c.image_ok)
  const recovered = changed.filter((c) => c.image_ok)

  for (const c of broken) console.log(`  BROKEN   ${c.title}`)
  for (const c of recovered) console.log(`  RECOVERED ${c.title}`)

  // Always write something so the run counts as database activity, which is
  // the whole point of the keepalive.
  if (changed.length > 0) {
    for (const c of changed) {
      const patch = await fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${c.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ image_ok: c.image_ok }),
      })
      if (!patch.ok) {
        console.error(`Failed to update ${c.id}: ${await patch.text()}`)
      }
    }
  } else {
    // No-op touch: rewrite one row's existing value to register write activity.
    const first = events[0]
    if (first) {
      await fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${first.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ image_ok: first.image_ok }),
      })
    }
  }

  const okCount = events.filter((e) => e.image_ok).length - broken.length + recovered.length
  console.log(
    `Done. ${okCount}/${events.length} events playable. ` +
    `${broken.length} newly broken, ${recovered.length} recovered.`
  )

  if (okCount < 10) {
    console.error('Fewer than 10 playable events — games will run out fast.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
