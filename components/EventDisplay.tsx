'use client'

import { Database } from '@/lib/database.types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { optimizedImageUrl } from '@/lib/images'

type Event = Database['public']['Tables']['events']['Row']

interface EventDisplayProps {
  event: Event
  /**
   * Fired once per event as soon as the picture is actually on screen — or has
   * definitively failed. The auto-advance countdown hangs off this, so that a
   * slow image cannot eat the time the player was supposed to spend looking at
   * it. Also fires on error, so a broken image cannot stall the game.
   *
   * Passes the event id so the caller can tell this round's readiness apart
   * from the previous round's.
   */
  onReady?: (eventId: string) => void
}

export default function EventDisplay({ event, onReady }: EventDisplayProps) {
  const [isCover, setIsCover] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const imgRef = useRef<HTMLImageElement | null>(null)

  // Prefer the lighter URL, but keep the original as a fallback so a failed
  // rewrite degrades to the picture we know works rather than to nothing.
  const [useOriginal, setUseOriginal] = useState(false)
  const optimizedUrl = optimizedImageUrl(event.image_url)
  const displayUrl = useOriginal ? event.image_url : optimizedUrl
  const canFallBack = !useOriginal && optimizedUrl !== event.image_url

  // Guards against reporting the same event twice (onLoad plus the cache check)
  const reportedRef = useRef<string | null>(null)
  const onReadyRef = useRef(onReady)
  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])

  const markReady = useCallback(() => {
    if (reportedRef.current === event.id) return
    reportedRef.current = event.id
    onReadyRef.current?.(event.id)
  }, [event.id])

  // Reset state whenever the event changes (defensive, key prop in parent should handle this too)
  useEffect(() => {
    setIsLoading(true)
    setHasError(false)
    setUseOriginal(false)
  }, [event.id])

  // If the browser already has the image cached, onLoad won't fire — check after mount
  useEffect(() => {
    if (imgRef.current?.complete) {
      setIsLoading(false)
      markReady()
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
            key={displayUrl}
            src={displayUrl}
            alt={event.title}
            className={`absolute inset-0 w-full h-full ${isCover ? 'object-cover' : 'object-contain'} transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
            onLoad={() => { setIsLoading(false); markReady() }}
            onError={() => {
              if (canFallBack) {
                // Rewritten URL failed — retry with the original before
                // declaring the image broken.
                setUseOriginal(true)
                return
              }
              setIsLoading(false)
              setHasError(true)
              markReady()
            }}
          />
        )}
      </div>
    </div>
  )
}

