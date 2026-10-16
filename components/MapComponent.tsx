'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type L from 'leaflet'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import { MapClickHandler } from './MapClickHandler'
import { supabase } from '@/lib/supabase'
import { createPlayerIcon, fixLeafletDefaultIcon } from '@/lib/colors'
import { BASEMAP_ATTRIBUTION, BASEMAP_URL } from '@/lib/basemap'
import {
  createLatestOnlySender,
  type LatestOnlySender,
  type PinSyncStatus,
} from '@/lib/pinSync'

interface MapComponentProps {
  gameId: string
  playerId: string
  round: number
  playerColor: string
  onGuess: () => void
  /** True once this player's guess is in, or the round is over. */
  disabled: boolean
  /** True when the local countdown has hit zero. */
  timeUp: boolean
}

// Separate inner component that will be completely remounted
function Map({
  mapRef,
  onLocationClick,
  disabled,
  guessLat,
  guessLon,
  playerIcon,
}: {
  mapRef: React.RefObject<L.Map>
  onLocationClick: (lat: number, lng: number) => void
  disabled: boolean
  guessLat: number | null
  guessLon: number | null
  playerIcon: any
}) {
  return (
    <MapContainer
      ref={mapRef}
      center={[20, 0]}
      zoom={2}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom={true}
      className="z-0"
      placeholder={<div>Laddar karta...</div>}
    >
      <TileLayer attribution={BASEMAP_ATTRIBUTION} url={BASEMAP_URL} />
      <MapClickHandler onLocationClick={onLocationClick} disabled={disabled} />
      {guessLat !== null && guessLon !== null && playerIcon && (
        <Marker position={[guessLat, guessLon]} icon={playerIcon} />
      )}
    </MapContainer>
  )
}

/**
 * The guessing map.
 *
 * This component no longer knows the answer and no longer awards points. It
 * used to fetch the event's coordinates, compute the distance in the browser
 * and write the player's own score — all of which were trivially forgeable.
 * submit_guess() now does the distance calculation server-side.
 *
 * Every pin placement is also saved with place_pin(), and close_round() turns
 * an unconfirmed pin into the player's guess. So a placed pin counts even if
 * this browser is asleep, offline or has a slow clock when time runs out.
 * "Klar!" only locks the guess in early.
 */
export default function MapComponent({
  gameId,
  playerId,
  round,
  playerColor,
  onGuess,
  disabled,
  timeUp,
}: MapComponentProps) {
  const [guessLat, setGuessLat] = useState<number | null>(null)
  const [guessLon, setGuessLon] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playerIcon, setPlayerIcon] = useState<any>(null)
  const [pinStatus, setPinStatus] = useState<PinSyncStatus>('idle')
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map>(null)
  const pinSenderRef = useRef<LatestOnlySender<{ lat: number; lon: number }> | null>(null)

  const hasPlacedPin = guessLat !== null && guessLon !== null

  useEffect(() => {
    fixLeafletDefaultIcon()
    setMounted(true)
  }, [])

  // The map box now flexes to fill whatever space is left instead of a fixed
  // vh value, so its pixel size can change (e.g. the guess panel below it
  // wraps to a second line) after Leaflet already measured the container.
  // Leaflet only listens for window resize, not container resize, so without
  // this the tiles stay sized for the old box until the window itself resizes.
  useEffect(() => {
    if (!mounted || !containerRef.current) return
    const observer = new ResizeObserver(() => {
      mapRef.current?.invalidateSize()
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [mounted])

  useEffect(() => {
    setPlayerIcon(createPlayerIcon(playerColor))
  }, [playerColor])

  // Reset for each new round
  useEffect(() => {
    setGuessLat(null)
    setGuessLon(null)
    setSubmitting(false)
    setSubmitted(false)
    setError(null)
    setPinStatus('idle')
  }, [round])

  // One sender per round, so a slow request from the previous round can never
  // report a status into this one.
  useEffect(() => {
    const sender = createLatestOnlySender<{ lat: number; lon: number }>(
      async ({ lat, lon }) => {
        const { error: rpcError } = await supabase.rpc('place_pin', {
          p_game_id: gameId,
          p_player_id: playerId,
          p_lat: lat,
          p_lon: lon,
        })
        if (rpcError) {
          console.error('Error saving pin:', rpcError)
          throw rpcError
        }
      },
      setPinStatus
    )
    pinSenderRef.current = sender
    return () => sender.stop()
  }, [gameId, playerId, round])

  const submitGuess = useCallback(async () => {
    if (guessLat === null || guessLon === null) return
    if (submitting || submitted) return

    setSubmitting(true)
    setError(null)

    const { error: rpcError } = await supabase.rpc('submit_guess', {
      p_game_id: gameId,
      p_player_id: playerId,
      p_lat: guessLat,
      p_lon: guessLon,
    })

    setSubmitting(false)

    if (rpcError) {
      console.error('Error submitting guess:', rpcError)
      // The round closing underneath us is expected, not worth alarming about.
      setError(
        rpcError.message?.includes('Tiden är ute')
          ? 'Tiden är ute!'
          : 'Det gick inte att skicka gissningen. Försök igen.'
      )
      return
    }

    setSubmitted(true)
    onGuess()
  }, [gameId, playerId, guessLat, guessLon, submitting, submitted, onGuess])

  // Backup for when the server may not have the latest pin (place_pin failed
  // or is still in flight): send it from here as the clock runs out. When the
  // pin is saved, close_round() promotes it and nothing needs doing.
  useEffect(() => {
    if (
      timeUp &&
      hasPlacedPin &&
      pinStatus !== 'saved' &&
      !submitting &&
      !submitted
    ) {
      submitGuess()
    }
  }, [timeUp, hasPlacedPin, pinStatus, submitting, submitted, submitGuess])

  const handleMapClick = (lat: number, lng: number) => {
    if (disabled || submitted || timeUp) return
    setGuessLat(lat)
    setGuessLon(lng)
    pinSenderRef.current?.push({ lat, lon: lng })
  }

  if (!mounted) {
    return (
      <div className="h-full bg-white rounded-lg shadow overflow-hidden flex flex-col">
        <div className="relative flex-1 min-h-0">
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Laddar karta...</p>
          </div>
        </div>
      </div>
    )
  }

  // `disabled` is also true after a refresh when this round's guess is
  // already stored, so it means "answered" just as much as `submitted` does.
  const answered = disabled || submitted
  const locked = answered || timeUp

  return (
    <div className="h-full bg-white rounded-xl shadow-xl overflow-hidden flex flex-col touch-manipulation">
      <div key={round} ref={containerRef} className="relative flex-1 min-h-0">
        <Map
          mapRef={mapRef}
          onLocationClick={handleMapClick}
          disabled={locked}
          guessLat={guessLat}
          guessLon={guessLon}
          playerIcon={playerIcon}
        />
        {locked && (
          <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center z-[1000] pointer-events-none">
            <div className="bg-white rounded-lg p-4 text-center shadow-lg">
              <p className="font-semibold text-gray-900">
                {answered ? 'Gissning skickad!' : 'Tiden är ute!'}
              </p>
              {!answered && !hasPlacedPin && (
                <p className="text-sm text-gray-600 mt-1">
                  Du fick inga poäng denna runda
                </p>
              )}
              {answered && (
                <p className="text-sm text-gray-600 mt-1">
                  Väntar på de andra spelarna...
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-gray-50 border-t">
        {error && (
          <p className="text-sm text-red-600 text-center mb-2">{error}</p>
        )}

        {/* The submit button. Without it every round burned the full clock,
            because guesses were only ever sent when the timer hit zero. */}
        {!locked ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-600 flex-1">
              {hasPlacedPin ? (
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  Du gissar på: {guessLat?.toFixed(2)}, {guessLon?.toFixed(2)}
                </span>
              ) : (
                'Klicka på kartan för att placera din nål'
              )}
            </p>
            <button
              onClick={submitGuess}
              disabled={!hasPlacedPin || submitting}
              className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-8 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
            >
              {submitting ? 'Skickar...' : 'Klar!'}
            </button>
          </div>
        ) : (
          <p className="text-sm text-gray-600 text-center">
            {submitting
              ? 'Skickar gissning...'
              : answered
              ? 'Gissning skickad!'
              : 'Tiden är ute!'}
          </p>
        )}
      </div>
    </div>
  )
}
