'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type * as LeafletTypes from 'leaflet'
import { BASEMAP_ATTRIBUTION, BASEMAP_URL } from '@/lib/basemap'
import { createPlayerIcon, fixLeafletDefaultIcon } from '@/lib/colors'

interface AdminPinMapProps {
  latitude: number | null
  longitude: number | null
  candidateId: string
  onChange: (lat: number, lon: number) => void
}

export default function AdminPinMap({
  latitude,
  longitude,
  candidateId,
  onChange,
}: AdminPinMapProps) {
  const [showLabels, setShowLabels] = useState(true)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletTypes.Map | null>(null)
  const markerRef = useRef<LeafletTypes.Marker | null>(null)
  const labelsLayerRef = useRef<LeafletTypes.TileLayer | null>(null)
  const lastCandidateIdRef = useRef<string | null>(null)

  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const labelOverlayUrl = useMemo(() => {
    return BASEMAP_URL.replace('/light_nolabels/', '/light_only_labels/')
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof window === 'undefined') return

    // Load leaflet only client-side inside useEffect (matches lib/colors.ts pattern)
    const L: typeof LeafletTypes = require('leaflet')
    fixLeafletDefaultIcon()

    // Create a fresh inner div every time the effect mounts so even if an old
    // Leaflet instance or HMR touched the outer container, the map target is brand new.
    el.innerHTML = ''
    const mapNode = document.createElement('div')
    mapNode.style.width = '100%'
    mapNode.style.height = '100%'
    el.appendChild(mapNode)

    const initialCenter: [number, number] =
      latitude !== null && longitude !== null ? [latitude, longitude] : [20, 0]
    const initialZoom = latitude !== null && longitude !== null ? 5 : 2

    const map = L.map(mapNode, {
      center: initialCenter,
      zoom: initialZoom,
      scrollWheelZoom: true,
    })
    mapRef.current = map
    lastCandidateIdRef.current = candidateId

    L.tileLayer(BASEMAP_URL, { attribution: BASEMAP_ATTRIBUTION }).addTo(map)

    const labelsLayer = L.tileLayer(labelOverlayUrl)
    labelsLayer.addTo(map)
    labelsLayerRef.current = labelsLayer

    map.on('click', (e: LeafletTypes.LeafletMouseEvent) => {
      onChangeRef.current(
        Number(e.latlng.lat.toFixed(6)),
        Number(e.latlng.lng.toFixed(6))
      )
    })

    const observer = new ResizeObserver(() => {
      map.invalidateSize()
    })
    observer.observe(el)

    return () => {
      observer.disconnect()
      markerRef.current = null
      labelsLayerRef.current = null
      mapRef.current = null
      try {
        map.remove()
      } catch {
        // Ignore cleanup errors
      }
      el.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Toggle city/place labels overlay
  useEffect(() => {
    const map = mapRef.current
    const labelsLayer = labelsLayerRef.current
    if (!map || !labelsLayer) return

    if (showLabels) {
      if (!map.hasLayer(labelsLayer)) {
        labelsLayer.addTo(map)
      }
    } else if (map.hasLayer(labelsLayer)) {
      map.removeLayer(labelsLayer)
    }
  }, [showLabels])

  // Sync marker position and recenter when switching to a new candidate card
  useEffect(() => {
    const map = mapRef.current
    if (!map || typeof window === 'undefined') return
    const L: typeof LeafletTypes = require('leaflet')

    const isNewCandidate = lastCandidateIdRef.current !== candidateId
    if (isNewCandidate) {
      lastCandidateIdRef.current = candidateId
      if (latitude !== null && longitude !== null) {
        map.setView([latitude, longitude], 5, { animate: true })
      } else {
        map.setView([20, 0], 2, { animate: true })
      }
    }

    if (latitude === null || longitude === null) {
      if (markerRef.current) {
        markerRef.current.remove()
        markerRef.current = null
      }
      return
    }

    if (!markerRef.current) {
      const redIcon = createPlayerIcon('red')
      const marker = L.marker([latitude, longitude], {
        draggable: true,
        ...(redIcon ? { icon: redIcon } : {}),
      }).addTo(map)

      marker.on('dragend', () => {
        const pos = marker.getLatLng()
        onChangeRef.current(
          Number(pos.lat.toFixed(6)),
          Number(pos.lng.toFixed(6))
        )
      })
      markerRef.current = marker
    } else {
      markerRef.current.setLatLng([latitude, longitude])
    }
  }, [latitude, longitude, candidateId])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-1.5 text-xs text-gray-600">
        <span>
          Klicka på kartan eller dra den röda nålen för att flytta rätt svar
        </span>
        <button
          type="button"
          onClick={() => setShowLabels((v) => !v)}
          className="touch-manipulation px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors"
        >
          {showLabels ? 'Dölj ortnamn (spelvy)' : 'Visa ortnamn'}
        </button>
      </div>
      <div
        ref={containerRef}
        className="relative flex-1 min-h-[240px] rounded-lg overflow-hidden border border-gray-200 bg-gray-100 z-0"
      />
    </div>
  )
}
