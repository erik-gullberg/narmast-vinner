'use client'

import { Database } from '@/lib/database.types'
import Image from 'next/image'

type Event = Database['public']['Tables']['events']['Row']

interface EventDisplayProps {
  event: Event
  showDetails?: boolean
}

export default function EventDisplay({ event, showDetails = true }: EventDisplayProps) {
  return (
    <div className="bg-white rounded-xl shadow-xl overflow-hidden">
      <div className="relative h-64 sm:h-80 bg-gray-200">
        <img
          src={event.image_url}
          alt={event.title}
          className="w-full h-full object-cover"
        />
      </div>
    </div>
  )
}

