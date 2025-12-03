'use client'

import { useMapEvents } from 'react-leaflet'

interface MapClickHandlerProps {
  onLocationClick: (lat: number, lng: number) => void
  disabled: boolean
}

export function MapClickHandler({ onLocationClick, disabled }: MapClickHandlerProps) {
  useMapEvents({
    click: (e) => {
      if (!disabled) {
        onLocationClick(e.latlng.lat, e.latlng.lng)
      }
    },
  })
  return null
}

