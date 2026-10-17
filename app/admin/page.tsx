'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdminPinMap from '@/components/AdminPinMap'
import { optimizedImageUrl } from '@/lib/images'
import {
  classifyRegion,
  isDuplicateEvent,
  trimDescription,
  type CandidateEvent,
  type DiscoveryCategory,
  type DiscoveryRegionFilter,
  type ExistingEventSummary,
  type Region,
} from '@/lib/wikipedia'

const REJECTED_STORAGE_KEY = 'nv_rejected_candidate_ids_v1'
const PASSWORD_STORAGE_KEY = 'nv_admin_password'

type SourceOption =
  | 'starter'
  | 'events'
  | 'disasters'
  | 'landmarks'
  | 'unesco'
  | 'sports_culture'

function toSqlInsert(ev: {
  title: string
  description: string
  image_url: string
  latitude: number
  longitude: number
  year: number
}): string {
  const esc = (s: string) => s.replace(/'/g, "''")
  return `INSERT INTO events (title, description, image_url, latitude, longitude, year) VALUES ('${esc(
    ev.title
  )}', '${esc(ev.description)}', '${esc(ev.image_url)}', ${ev.latitude}, ${
    ev.longitude
  }, ${ev.year});`
}

export default function AdminSwipePage() {
  const [password, setPassword] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)

  // Existing DB events & stats
  const [existingEvents, setExistingEvents] = useState<ExistingEventSummary[]>(
    []
  )
  const [regionCounts, setRegionCounts] = useState<Record<Region, number>>({
    Europa: 0,
    Nordamerika: 0,
    Sydamerika: 0,
    Asien: 0,
    Afrika: 0,
    Oceanien: 0,
    Övrigt: 0,
  })

  // Candidate queue & rejected IDs
  const [queue, setQueue] = useState<CandidateEvent[]>([])
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set())
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  // Discovery controls
  const [source, setSource] = useState<SourceOption>('starter')
  const [regionFilter, setRegionFilter] =
    useState<DiscoveryRegionFilter>('non_europe')
  const [offsets, setOffsets] = useState<Record<string, number>>({})
  const [urlInput, setUrlInput] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)

  // Current card editable state
  const currentCard = queue[0] ?? null
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [fullExtract, setFullExtract] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [year, setYear] = useState<string>('')
  const [isCover, setIsCover] = useState(false)
  const [imageError, setImageError] = useState(false)

  // Session approved SQL log
  const [approvedSql, setApprovedSql] = useState<string[]>([])
  const [showSqlLog, setShowSqlLog] = useState(false)

  // Load rejected IDs from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(REJECTED_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          setRejectedIds(new Set(parsed))
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, [])

  const saveRejectedId = useCallback((id: string) => {
    setRejectedIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      try {
        localStorage.setItem(REJECTED_STORAGE_KEY, JSON.stringify([...next]))
      } catch {
        // Ignore storage errors
      }
      return next
    })
  }, [])

  // Sync currentCard into editable form state
  useEffect(() => {
    if (!currentCard) return
    setTitle(currentCard.title)
    setDescription(currentCard.description)
    setFullExtract(currentCard.description)
    setImageUrl(currentCard.image_url)
    setLatitude(currentCard.latitude)
    setLongitude(currentCard.longitude)
    setYear(currentCard.year !== null ? String(currentCard.year) : '')
    setImageError(false)
  }, [currentCard])

  const loadExistingEvents = useCallback(async (pwd: string) => {
    setAuthLoading(true)
    setAuthError(null)
    try {
      const res = await fetch('/api/admin/events', {
        headers: { 'x-admin-password': pwd },
      })
      const data = await res.json()
      if (!res.ok) {
        setAuthError(data.error || 'Kunde inte logga in.')
        setAuthenticated(false)
        return false
      }
      setExistingEvents(data.events ?? [])
      if (data.regionCounts) {
        setRegionCounts(data.regionCounts)
      }
      setPassword(pwd)
      setAuthenticated(true)
      try {
        sessionStorage.setItem(PASSWORD_STORAGE_KEY, pwd)
      } catch {
        // Ignore
      }
      return true
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Kunde inte nå servern.'
      )
      return false
    } finally {
      setAuthLoading(false)
    }
  }, [])

  // Auto-login if password in sessionStorage
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(PASSWORD_STORAGE_KEY)
      if (saved) {
        setPasswordInput(saved)
        loadExistingEvents(saved)
      }
    } catch {
      // Ignore
    }
  }, [loadExistingEvents])

  const fetchBatch = useCallback(
    async (
      customSource?: SourceOption,
      customRegion?: DiscoveryRegionFilter
    ) => {
      if (!password) return
      const activeSource = customSource ?? source
      const activeRegion = customRegion ?? regionFilter
      const offsetKey =
        activeSource === 'starter'
          ? 'starter'
          : `${activeSource}:${activeRegion}`
      const currentOffset = offsets[offsetKey] ?? 0

      setDiscoverLoading(true)
      setToast(null)
      try {
        const payload =
          activeSource === 'starter'
            ? { mode: 'starter', offset: currentOffset, limit: 12 }
            : {
                mode: 'wikidata',
                category: activeSource as DiscoveryCategory,
                region: activeRegion,
                offset: currentOffset,
                limit: 12,
              }

        const res = await fetch('/api/admin/discover', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-password': password,
          },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (!res.ok) {
          setToast({
            type: 'error',
            text: data.error || 'Kunde inte hämta förslag.',
          })
          return
        }

        const incoming: CandidateEvent[] = data.candidates ?? []
        setOffsets((prev) => ({
          ...prev,
          [offsetKey]: data.nextOffset ?? currentOffset + 12,
        }))

        setQueue((prev) => {
          const existingQueueIds = new Set(prev.map((c) => c.id))
          const filtered = incoming.filter(
            (c) =>
              !existingQueueIds.has(c.id) &&
              !rejectedIds.has(c.id) &&
              !isDuplicateEvent(c, existingEvents)
          )
          if (filtered.length === 0) {
            setToast({
              type: 'error',
              text: 'Inga nya unika förslag i denna batch — klicka på "Hämta fler" igen för nästa sida.',
            })
          }
          return [...prev, ...filtered]
        })
      } catch (err) {
        setToast({
          type: 'error',
          text:
            err instanceof Error
              ? err.message
              : 'Fel vid hämtning av förslag.',
        })
      } finally {
        setDiscoverLoading(false)
      }
    },
    [password, source, regionFilter, offsets, rejectedIds, existingEvents]
  )

  // Fetch starter batch automatically right after login if queue is empty
  useEffect(() => {
    if (authenticated && queue.length === 0 && !discoverLoading) {
      fetchBatch('starter', 'non_europe')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated])

  const handleFetchUrls = async (e: React.FormEvent) => {
    e.preventDefault()
    const urls = urlInput
      .split(/[\s,\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes('wikipedia.org/wiki/'))

    if (urls.length === 0) {
      setToast({
        type: 'error',
        text: 'Klistra in minst en giltig Wikipedia-länk (t.ex. https://sv.wikipedia.org/wiki/...).',
      })
      return
    }

    setUrlLoading(true)
    setToast(null)
    try {
      const res = await fetch('/api/admin/discover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password,
        },
        body: JSON.stringify({ mode: 'urls', urls }),
      })
      const data = await res.json()
      if (!res.ok) {
        setToast({
          type: 'error',
          text: data.error || 'Kunde inte hämta URL.',
        })
        return
      }

      const incoming: CandidateEvent[] = data.candidates ?? []
      if (incoming.length > 0) {
        setQueue((prev) => [...incoming, ...prev])
        setUrlInput('')
        setToast({
          type: 'success',
          text: `Lade till ${incoming.length} artikel/artiklar överst i kön!`,
        })
      } else {
        setToast({
          type: 'error',
          text:
            data.errors?.join('; ') || 'Kunde inte läsa Wikipedia-artikeln.',
        })
      }
    } catch (err) {
      setToast({
        type: 'error',
        text: err instanceof Error ? err.message : 'Fel vid hämtning av URL.',
      })
    } finally {
      setUrlLoading(false)
    }
  }

  const handleReject = useCallback(() => {
    if (!currentCard) return
    saveRejectedId(currentCard.id)
    setQueue((prev) => prev.slice(1))
    setToast(null)
  }, [currentCard, saveRejectedId])

  const handleSkipToLater = useCallback(() => {
    if (!currentCard) return
    setQueue((prev) => (prev.length <= 1 ? prev : [...prev.slice(1), prev[0]]))
    setToast(null)
  }, [currentCard])

  const handleApprove = useCallback(async () => {
    if (!currentCard || saving) return

    const parsedYear = parseInt(year, 10)
    if (!title.trim() || !description.trim() || !imageUrl.trim()) {
      setToast({
        type: 'error',
        text: 'Titel, beskrivning och bild-URL måste vara ifyllda innan du godkänner.',
      })
      return
    }
    if (latitude === null || longitude === null) {
      setToast({
        type: 'error',
        text: 'Placera ut nålen på kartan först (koordinater saknas).',
      })
      return
    }
    if (Number.isNaN(parsedYear)) {
      setToast({
        type: 'error',
        text: 'Fyll i ett giltigt årtal (t.ex. 1989) innan du godkänner.',
      })
      return
    }

    setSaving(true)
    setToast(null)
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        image_url: imageUrl.trim(),
        latitude,
        longitude,
        year: parsedYear,
      }

      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password,
        },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setToast({
          type: 'error',
          text: data.error || 'Kunde inte spara till Supabase.',
        })
        return
      }

      const region = classifyRegion(latitude, longitude)
      setExistingEvents((prev) => [payload, ...prev])
      setRegionCounts((prev) => ({
        ...prev,
        [region]: (prev[region] ?? 0) + 1,
      }))
      setApprovedSql((prev) => [toSqlInsert(payload), ...prev])
      setQueue((prev) => prev.slice(1))
      setToast({
        type: 'success',
        text: `Sparade "${payload.title}" (${region}, ${payload.year}) i Supabase!`,
      })
    } catch (err) {
      setToast({
        type: 'error',
        text:
          err instanceof Error ? err.message : 'Nätverksfel vid sparning.',
      })
    } finally {
      setSaving(false)
    }
  }, [
    currentCard,
    saving,
    year,
    title,
    description,
    imageUrl,
    latitude,
    longitude,
    password,
  ])

  // Keyboard shortcuts: Left = Reject, Right = Approve, Down = Skip to back of queue
  useEffect(() => {
    if (!authenticated || !currentCard) return
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handleReject()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        handleApprove()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        handleSkipToLater()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    authenticated,
    currentCard,
    handleReject,
    handleApprove,
    handleSkipToLater,
  ])

  const currentRegion = useMemo(
    () => classifyRegion(latitude, longitude),
    [latitude, longitude]
  )

  const totalDbEvents = existingEvents.length

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl p-8 w-full max-w-md">
          <div className="flex items-center gap-3 mb-6">
            <img src="/logo.png" alt="Närmast Vinner" width={36} height={36} />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Event-Tinder (Admin)
              </h1>
              <p className="text-sm text-gray-500">
                Logga in med <code className="font-mono">ADMIN_PASSWORD</code>
              </p>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              loadExistingEvents(passwordInput)
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Admin-lösenord
              </label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Ange ADMIN_PASSWORD..."
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                autoFocus
              />
            </div>

            {authError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading || !passwordInput}
              className="touch-manipulation w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
            >
              {authLoading ? 'Kontrollerar...' : 'Öppna Event-Tinder'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Top header + Live DB geographic balance */}
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <img src="/logo.png" alt="Närmast Vinner" width={32} height={32} />
              <span className="font-bold text-lg text-gray-900">
                Event-Tinder
              </span>
            </Link>
            <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-semibold">
              {totalDbEvents} events i Supabase
            </span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">
              {queue.length} i kön
            </span>
          </div>

          {/* Live Continent Breakdown */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {(
              [
                'Europa',
                'Nordamerika',
                'Asien',
                'Afrika',
                'Sydamerika',
                'Oceanien',
              ] as Region[]
            ).map((reg) => {
              const count = regionCounts[reg] ?? 0
              const pct =
                totalDbEvents > 0
                  ? Math.round((count / totalDbEvents) * 100)
                  : 0
              const isHighEurope = reg === 'Europa' && pct > 45
              return (
                <span
                  key={reg}
                  className={`px-2 py-1 rounded font-medium ${
                    isHighEurope
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : 'bg-gray-50 text-gray-700 border border-gray-200'
                  }`}
                >
                  {reg}: {count} ({pct}%)
                </span>
              )
            })}
          </div>
        </div>
      </header>

      {/* Discovery & URL Paste Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2.5 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as SourceOption)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-900 bg-white"
            >
              <option value="starter">
                ⭐ Utvalt startpaket (Globala klassiker)
              </option>
              <option value="events">
                🌍 Wikidata: Historiska händelser (sv.wiki)
              </option>
              <option value="disasters">
                🌋 Wikidata: Katastrofer & olyckor (sv.wiki)
              </option>
              <option value="landmarks">
                🏛️ Wikidata: Kända byggnader & monument (sv.wiki)
              </option>
              <option value="unesco">
                🏞️ Wikidata: Världsarv & nationalparker (sv.wiki)
              </option>
              <option value="sports_culture">
                🏟️ Wikidata: Idrott, OS & kultur (sv.wiki)
              </option>
            </select>

            {source !== 'starter' && (
              <select
                value={regionFilter}
                onChange={(e) =>
                  setRegionFilter(e.target.value as DiscoveryRegionFilter)
                }
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-900 bg-white"
              >
                <option value="non_europe">Utanför Europa (Rekommenderas)</option>
                <option value="asia">Asien</option>
                <option value="africa">Afrika</option>
                <option value="south_america">Sydamerika</option>
                <option value="north_america">Nord- & Centralamerika</option>
                <option value="oceania">Oceanien</option>
                <option value="europe">Europa</option>
                <option value="all">Hela världen</option>
              </select>
            )}

            <button
              type="button"
              onClick={() => fetchBatch()}
              disabled={discoverLoading}
              className="touch-manipulation px-3.5 py-1.5 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white transition-colors"
            >
              {discoverLoading ? 'Hämtar från Wikipedia...' : '+ Hämta fler förslag'}
            </button>
          </div>

          {/* Paste Wikipedia URL directly */}
          <form
            onSubmit={handleFetchUrls}
            className="flex items-center gap-2 flex-1 max-w-xl"
          >
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Eller klistra in Wikipedia-URL (sv eller en)..."
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-900"
            />
            <button
              type="submit"
              disabled={urlLoading || !urlInput.trim()}
              className="touch-manipulation px-3 py-1.5 text-sm font-semibold rounded-lg bg-gray-800 hover:bg-gray-900 disabled:bg-gray-300 text-white transition-colors whitespace-nowrap"
            >
              {urlLoading ? 'Läser...' : 'Hämta URL'}
            </button>
          </form>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 flex flex-col gap-4">
        {toast && (
          <div
            className={`px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-between ${
              toast.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            <span>{toast.text}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-xs underline ml-4"
            >
              Stäng
            </button>
          </div>
        )}

        {!currentCard ? (
          <div className="bg-white rounded-xl shadow p-12 text-center my-auto">
            <h2 className="text-xl font-bold text-gray-800 mb-2">
              {discoverLoading
                ? 'Hämtar förslag från Wikipedia & Wikidata...'
                : 'Kön är tom!'}
            </h2>
            <p className="text-gray-600 mb-6">
              {discoverLoading
                ? 'Kontrollerar bilder, koordinater och svenska artiklar...'
                : 'Välj en kategori i toppen och klicka på "+ Hämta fler förslag", eller klistra in en Wikipedia-länk.'}
            </p>
            {!discoverLoading && (
              <button
                type="button"
                onClick={() => fetchBatch()}
                className="touch-manipulation bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-6 rounded-lg"
              >
                Hämta fler förslag
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200 flex flex-col">
            {/* Card top metadata bar */}
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-indigo-100 text-indigo-800">
                  {currentRegion}
                </span>
                {currentCard.sitelinks && (
                  <span className="text-xs text-gray-500">
                    🌐 {currentCard.sitelinks} språkversioner på Wikipedia
                  </span>
                )}
              </div>
              <a
                href={currentCard.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              >
                Öppna källa på Wikipedia ↗
              </a>
            </div>

            {/* Two-column Tinder Card body */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-5">
              {/* LEFT: Player image preview + alternate image picker */}
              <div className="lg:col-span-6 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Spelarvy (endast denna bild visas i runda)
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsCover((v) => !v)}
                    className="text-xs px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium"
                  >
                    Visning: {isCover ? 'Fyll (Cover)' : 'Hel bild (Contain)'}
                  </button>
                </div>

                <div className="relative h-[300px] sm:h-[360px] bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center">
                  {imageUrl && !imageError ? (
                    <img
                      key={imageUrl}
                      src={optimizedImageUrl(imageUrl)}
                      alt={title}
                      className={`w-full h-full ${
                        isCover ? 'object-cover' : 'object-contain'
                      }`}
                      onError={(e) => {
                        const raw = imageUrl.split('?')[0]
                        if (e.currentTarget.src !== raw) {
                          e.currentTarget.src = raw
                          return
                        }
                        setImageError(true)
                      }}
                    />
                  ) : (
                    <div className="text-center p-6 text-gray-400 text-sm">
                      Bilden kunde inte laddas. Välj en annan bild nedan eller
                      förkasta kortet.
                    </div>
                  )}
                </div>

                {/* Alternate images strip from the Wikipedia article */}
                {currentCard.alternate_images.length > 1 && (
                  <div>
                    <p className="text-xs text-gray-600 mb-1.5 font-medium">
                      Andra bilder i artikeln (klicka för att byta om huvudbilden
                      är ett porträtt eller avslöjar för mycket):
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {currentCard.alternate_images.map((altUrl) => {
                        const cleanAlt = altUrl.split('?')[0]
                        const selected = cleanAlt === imageUrl.split('?')[0]
                        return (
                          <button
                            key={altUrl}
                            type="button"
                            onClick={() => {
                              setImageUrl(cleanAlt)
                              setImageError(false)
                            }}
                            className={`relative flex-shrink-0 w-20 h-16 rounded-md overflow-hidden border-2 transition-all ${
                              selected
                                ? 'border-indigo-600 ring-2 ring-indigo-300'
                                : 'border-transparent opacity-75 hover:opacity-100'
                            }`}
                          >
                            <img
                              src={optimizedImageUrl(cleanAlt, 330)}
                              alt=""
                              loading="lazy"
                              className="w-full h-full object-cover bg-gray-200"
                              onError={(e) => {
                                if (e.currentTarget.src !== cleanAlt) {
                                  e.currentTarget.src = cleanAlt
                                }
                              }}
                            />
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Bild-URL (Wikimedia Commons)
                  </label>
                  <input
                    type="text"
                    value={imageUrl}
                    onChange={(e) => {
                      setImageUrl(e.target.value)
                      setImageError(false)
                    }}
                    className="w-full px-3 py-1.5 text-xs font-mono border border-gray-300 rounded-lg text-gray-800"
                  />
                </div>
              </div>

              {/* RIGHT: Draggable Pin Map + Editable Swedish Title, Year & Description */}
              <div className="lg:col-span-6 flex flex-col gap-3">
                <div className="h-[260px]">
                  <AdminPinMap
                    candidateId={currentCard.id}
                    latitude={latitude}
                    longitude={longitude}
                    onChange={(lat, lon) => {
                      setLatitude(lat)
                      setLongitude(lon)
                    }}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Titel (visas vid avslöjande)
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-semibold border border-gray-300 rounded-lg text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Årtal
                    </label>
                    <input
                      type="number"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      placeholder="t.ex. 1989"
                      className="w-full px-3 py-2 text-sm font-semibold border border-gray-300 rounded-lg text-gray-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Latitud
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={latitude ?? ''}
                      onChange={(e) =>
                        setLatitude(
                          e.target.value === ''
                            ? null
                            : parseFloat(e.target.value)
                        )
                      }
                      className="w-full px-3 py-1.5 text-xs font-mono border border-gray-300 rounded-lg text-gray-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Longitud
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={longitude ?? ''}
                      onChange={(e) =>
                        setLongitude(
                          e.target.value === ''
                            ? null
                            : parseFloat(e.target.value)
                        )
                      }
                      className="w-full px-3 py-1.5 text-xs font-mono border border-gray-300 rounded-lg text-gray-800"
                    />
                  </div>
                </div>

                <div className="flex-1 flex flex-col">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-gray-700">
                      Beskrivning (svenska)
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setDescription(trimDescription(fullExtract, 1))
                        }
                        className="text-xs text-indigo-600 hover:underline"
                      >
                        1 mening
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDescription(trimDescription(fullExtract, 2))
                        }
                        className="text-xs text-indigo-600 hover:underline"
                      >
                        2 meningar
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-900"
                  />
                </div>
              </div>
            </div>

            {/* Bottom Tinder Swipe Bar */}
            <div className="px-5 py-4 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleReject}
                disabled={saving}
                className="touch-manipulation flex-1 sm:flex-initial px-6 py-3 rounded-xl bg-red-100 hover:bg-red-200 text-red-800 font-bold text-sm transition-colors"
              >
                ← Förkasta (Vänsterpil)
              </button>

              <button
                type="button"
                onClick={handleSkipToLater}
                disabled={saving || queue.length <= 1}
                className="touch-manipulation px-4 py-3 rounded-xl bg-gray-200 hover:bg-gray-300 disabled:opacity-40 text-gray-700 font-semibold text-sm transition-colors"
              >
                ↓ Sist i kön (Nedåtpil)
              </button>

              <button
                type="button"
                onClick={handleApprove}
                disabled={saving}
                className="touch-manipulation flex-1 sm:flex-initial px-8 py-3 rounded-xl bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-bold text-sm shadow-sm transition-colors"
              >
                {saving
                  ? 'Sparar i Supabase...'
                  : 'Godkänn & spara i Supabase → (Högerpil)'}
              </button>
            </div>
          </div>
        )}

        {/* Session SQL Log (optional backup copy) */}
        {approvedSql.length > 0 && (
          <div className="bg-white rounded-xl shadow border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowSqlLog((v) => !v)}
                className="text-sm font-semibold text-gray-700 hover:text-gray-900"
              >
                {showSqlLog ? '▼' : '▶'} Godkända under denna session (
                {approvedSql.length} st — redan sparade i Supabase)
              </button>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(approvedSql.join('\n'))
                  setToast({
                    type: 'success',
                    text: 'Kopierade SQL-satser till urklipp!',
                  })
                }}
                className="text-xs px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium"
              >
                Kopiera SQL
              </button>
            </div>
            {showSqlLog && (
              <pre className="mt-3 p-3 bg-gray-900 text-gray-100 rounded-lg text-xs overflow-x-auto font-mono">
                {approvedSql.join('\n')}
              </pre>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
