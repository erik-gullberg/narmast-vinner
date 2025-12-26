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

  return (
    <div className="bg-white rounded-xl shadow-xl overflow-hidden">
      <div
        className="relative h-96 sm:h-[32rem] md:h-[36rem] lg:h-[40rem] bg-gray-200 cursor-pointer"
        onClick={() => setIsCover(!isCover)}
      >
        <Image
          src={event.image_url}
          alt={event.title}
          fill
          className={isCover ? "object-cover" : "object-contain"}
          sizes="(max-width: 640px) 100vw, (max-width: 768px) 100vw, (max-width: 1024px) 100vw, 100vw"
          unoptimized={event.image_url.includes('wikimedia')}
        />
      </div>
    </div>
  )
}

