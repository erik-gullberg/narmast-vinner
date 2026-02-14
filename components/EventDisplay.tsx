'use client'

import { Database } from '@/lib/database.types'
import Image from 'next/image'
import { useState } from 'react'

type Event = Database['public']['Tables']['events']['Row']

interface EventDisplayProps {
  event: Event
}

export default function EventDisplay({ event }: EventDisplayProps) {
  const [isCover, setIsCover] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  return (
    <div className="bg-white rounded-xl shadow-xl overflow-hidden">
      <div
        className="relative h-96 sm:h-[32rem] md:h-[36rem] lg:h-[40rem] bg-gray-200 cursor-pointer"
        onClick={() => setIsCover(!isCover)}
      >
        {/* Loading skeleton */}
        {isLoading && (
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
        <Image
          src={event.image_url}
          alt={event.title}
          fill
          priority
          className={`${isCover ? "object-cover" : "object-contain"} transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
          sizes="100vw"
          unoptimized={event.image_url.includes('wikimedia')}
          onLoad={() => setIsLoading(false)}
          fetchPriority="high"
        />
      </div>
    </div>
  )
}

