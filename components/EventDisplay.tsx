'use client'

import { Database } from '@/lib/database.types'
import { useEffect, useRef, useState } from 'react'

type Event = Database['public']['Tables']['events']['Row']

interface EventDisplayProps {
  event: Event
}

export default function EventDisplay({ event }: EventDisplayProps) {
  const [isCover, setIsCover] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const imgRef = useRef<HTMLImageElement | null>(null)

  // Reset state whenever the event changes (defensive, key prop in parent should handle this too)
  useEffect(() => {
    setIsLoading(true)
    setHasError(false)
  }, [event.id])

  // If the browser already has the image cached, onLoad won't fire — check after mount
  useEffect(() => {
    if (imgRef.current?.complete) {
      setIsLoading(false)
    }
  })

  return (
    <div className="bg-white rounded-xl shadow-xl overflow-hidden">
      <div
        className="relative h-96 sm:h-[32rem] md:h-[36rem] lg:h-[40rem] bg-gray-200 cursor-pointer"
        onClick={() => !hasError && setIsCover(!isCover)}
      >
        {/* Loading skeleton */}
        {isLoading && !hasError && (
          <div className="absolute inset-0 bg-gray-200 animate-pulse flex items-center justify-center z-10">
            <svg
              className="w-12 h-12 text-gray-400 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        )}

        {/* Error fallback */}
        {hasError && (
          <div className="absolute inset-0 bg-gray-100 flex flex-col items-center justify-center z-10 gap-3">
            <svg className="w-16 h-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-500 font-medium">Bilden kunde inte laddas</p>
          </div>
        )}

        {!hasError && (
          <img
            ref={imgRef}
            src={event.image_url}
            alt={event.title}
            className={`absolute inset-0 w-full h-full ${isCover ? 'object-cover' : 'object-contain'} transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
            onLoad={() => setIsLoading(false)}
            onError={() => { setIsLoading(false); setHasError(true) }}
          />
        )}
      </div>
    </div>
  )
}

