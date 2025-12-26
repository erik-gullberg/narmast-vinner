'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/lib/database.types'
import { sampleEvents } from '@/lib/events'

type Game = Database['public']['Tables']['games']['Row']

interface GameControlsProps {
  game: Game | null
  playersCount: number
  onShowResults: () => void
}

export default function GameControls({
  game,
  playersCount,
  onShowResults,
}: GameControlsProps) {
  const [starting, setStarting] = useState(false)

  const startGame = async () => {
    if (!game || playersCount === 0) return

    setStarting(true)

    try {
      // Insert sample events into database (if not already there)
      const { data: existingEvents } = await supabase
        .from('events')
        .select('id')
        .limit(1)

      if (!existingEvents || existingEvents.length === 0) {
        await supabase.from('events').insert(sampleEvents)
      }

      // Get a random event
      const { data: events } = await supabase
        .from('events')
        .select('id')

      if (!events || events.length === 0) return

      const randomEvent = events[Math.floor(Math.random() * events.length)]

      // Update game status and initialize used_event_ids with the first event
      await supabase
        .from('games')
        .update({
          status: 'playing',
          current_round: 1,
          current_event_id: randomEvent.id,
          phase: 'showing_image',
          used_event_ids: [randomEvent.id],
        })
        .eq('id', game.id)
    } catch (error) {
      console.error('Error starting game:', error)
    } finally {
      setStarting(false)
    }
  }

  const nextRound = async () => {
    if (!game) return

    try {
      const usedEventIds = game.used_event_ids || []

      const { data: events } = await supabase
        .from('events')
        .select('id')
        .not('id', 'in', `(${usedEventIds.join(',')})`)

      if (!events || events.length === 0) {
        // No more unused events, end game
        await supabase
          .from('games')
          .update({ status: 'finished' })
          .eq('id', game.id)
        return
      }

      const randomEvent = events[Math.floor(Math.random() * events.length)]

      // Update game with new round and add event to used list
      await supabase
        .from('games')
        .update({
          current_round: game.current_round + 1,
          current_event_id: randomEvent.id,
          phase: 'showing_image',
          used_event_ids: [...usedEventIds, randomEvent.id],
        })
        .eq('id', game.id)
    } catch (error) {
      console.error('Error starting next round:', error)
    }
  }

  const startGuessing = async () => {
    if (!game) return

    try {
      await supabase
        .from('games')
        .update({
          phase: 'guessing',
          phase_started_at: new Date().toISOString()
        })
        .eq('id', game.id)
    } catch (error) {
      console.error('Error starting guessing phase:', error)
    }
  }

  const endGame = async () => {
    if (!game) return

    try {
      await supabase
        .from('games')
        .update({ status: 'finished' })
        .eq('id', game.id)
    } catch (error) {
      console.error('Error ending game:', error)
    }
  }

  if (!game) return null

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="font-bold text-lg mb-3 text-gray-800">Spelkontroller</h3>

      {game.status === 'waiting' && (
        <button
          onClick={startGame}
          disabled={playersCount === 0 || starting}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
        >
          {starting ? 'Starting...' : 'Start Game'}
        </button>
      )}

      {game.status === 'playing' && (
        <div className="space-y-2">
          {game.phase === 'showing_image' && (
            <button
              onClick={startGuessing}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg touch-manipulation"
            >
              Start Guessing
            </button>
          )}
          {game.phase === 'guessing' && (
            <>
              <button
                onClick={nextRound}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-lg touch-manipulation"
              >
                Nästa runda
              </button>
            </>
          )}
          <button
            onClick={endGame}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-lg touch-manipulation"
          >
            Avsluta spel
          </button>
        </div>
      )}
    </div>
  )
}

