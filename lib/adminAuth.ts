import { createHash, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from './database.types'

/**
 * Verifies the `x-admin-password` request header against `process.env.ADMIN_PASSWORD`
 * using constant-time digest comparison.
 *
 * Fails closed if `ADMIN_PASSWORD` is not configured on the server.
 */
export function verifyAdminRequest(req: NextRequest): NextResponse | null {
  const configuredPassword = process.env.ADMIN_PASSWORD
  if (!configuredPassword || configuredPassword.trim().length === 0) {
    return NextResponse.json(
      {
        error:
          'ADMIN_PASSWORD saknas i serverns miljövariabler (.env.local / Vercel).',
      },
      { status: 503 }
    )
  }

  const provided = req.headers.get('x-admin-password') ?? ''
  const a = createHash('sha256').update(configuredPassword).digest()
  const b = createHash('sha256').update(provided).digest()

  if (!timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Fel lösenord.' }, { status: 401 })
  }

  return null
}

/**
 * Creates a server-only Supabase client authenticated with `SUPABASE_SERVICE_ROLE_KEY`.
 * `anon` has no write access to `events` (revoked in migration_critical_fixes_part_b.sql).
 */
export function createServiceSupabaseClient() {
  const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  if (!url || !serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY eller NEXT_PUBLIC_SUPABASE_URL saknas på servern.'
    )
  }

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
