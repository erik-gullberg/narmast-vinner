'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import { MapClickHandler } from './MapClickHandler'
import { supabase } from '@/lib/supabase'
import { calculateDistance } from '@/lib/utils'

interface MapComponentProps {
  gameId: string
  playerId: string
  eventId: string
  round: number
  onGuess: () => void
  disabled: boolean
}

// Separate inner component that will be completely remounted
function Map({
  onLocationClick,
  disabled,
  guessLat,
  guessLon
}: {
  onLocationClick: (lat: number, lng: number) => void
  disabled: boolean
  guessLat: number | null
  guessLon: number | null
}) {
  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom={true}
      className="z-0"
      placeholder={<div>Loading map...</div>}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
      />
      <MapClickHandler onLocationClick={onLocationClick} disabled={disabled} />
      {guessLat && guessLon && (
        <Marker position={[guessLat, guessLon]} />
      )}
    </MapContainer>
  )
}

export default function MapComponent({
  gameId,
  playerId,
  eventId,
  round,
  onGuess,
  disabled,
}: MapComponentProps) {
  const [guessLat, setGuessLat] = useState<number | null>(null)
  const [guessLon, setGuessLon] = useState<number | null>(null)
  const [hasPlacedPin, setHasPlacedPin] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    // Fix for default marker icons in Leaflet
    import('leaflet').then((L) => {
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      })
    })
    setMounted(true)
  }, [])

  useEffect(() => {
    setGuessLat(null)
    setGuessLon(null)
    setHasPlacedPin(false)
    setSubmitting(false)
  }, [round])

  // Auto-submit guess when time runs out
  useEffect(() => {
    if (disabled && hasPlacedPin && !submitting && guessLat && guessLon) {
      submitGuess()
    }
  }, [disabled])

  const handleMapClick = (lat: number, lng: number) => {
    if (!disabled) {
      setGuessLat(lat)
      setGuessLon(lng)
      setHasPlacedPin(true)
    }
  }

  const submitGuess = async () => {
    if (!guessLat || !guessLon || submitting) return

    setSubmitting(true)

    try {
      const { data: event } = await supabase
        .from('events')
        .select('latitude, longitude')
        .eq('id', eventId)
        .single()

      if (!event) return

      const distance = calculateDistance(
        guessLat,
        guessLon,
        event.latitude,
        event.longitude
      )

      await supabase.from('guesses').insert({
        game_id: gameId,
        player_id: playerId,
        event_id: eventId,
        latitude: guessLat,
        longitude: guessLon,
        distance_km: distance,
        round,
      })

      const points = Math.max(0, Math.round(1000 - distance))

      const { data: player } = await supabase
        .from('players')
        .select('score')
        .eq('id', playerId)
        .single()

      if (player) {
        await supabase
          .from('players')
          .update({ score: player.score + points })
          .eq('id', playerId)
      }

      onGuess()
    } catch (error) {
      console.error('Error submitting guess:', error)
    }
  }

  if (!mounted) {
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden flex flex-col">
        <div className="relative flex-1" style={{ minHeight: '400px', height: '60vh' }}>
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Loading map...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-xl overflow-hidden flex flex-col touch-none h-[50vh] lg:h-[600px]">
      <div key={round} className="relative flex-1 h-full">
        <Map
          onLocationClick={handleMapClick}
          disabled={disabled}
          guessLat={guessLat}
          guessLon={guessLon}
        />
        {disabled && (
          <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center z-[1000] pointer-events-none">
            <div className="bg-white rounded-lg p-4 text-center shadow-lg">
              <p className="font-semibold text-gray-900">
                {hasPlacedPin ? 'Gissning skickad!' : 'Tyvärr, tiden är ute!'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-gray-50 border-t">
        {hasPlacedPin && !disabled ? (
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <p className="text-sm text-gray-600">
              Du gissar på: {guessLat?.toFixed(2)}, {guessLon?.toFixed(2)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-600 text-center">
            {disabled
              ? (submitting ? 'Skickar gissning..' : hasPlacedPin ? 'Gissning skickad!' : 'Tiden är ute!')
              : 'Klicka på kartan för att placera din nål'}
          </p>
        )}
      </div>
    </div>
  )
}

