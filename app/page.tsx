'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { generateGameCode } from '@/lib/utils'
import { getAvailableColor } from '@/lib/colors'

export default function Home() {
  const router = useRouter()
  const [playerName, setPlayerName] = useState('')
  const [gameCode, setGameCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const createGame = async () => {
    if (!playerName.trim()) {
      setError('Skriv in ditt namn')
      return
    }

    setLoading(true)
    setError('')

    try {
      const code = generateGameCode()
      const hostId = crypto.randomUUID()

      // Create game
      const { data: game, error: gameError } = await supabase
        .from('games')
        .insert({
          code,
          host_id: hostId,
          status: 'waiting',
          current_round: 0,
        })
        .select()
        .single()

      if (gameError) throw gameError

      // Add host as first player
      const { error: playerError } = await supabase
        .from('players')
        .insert({
          id: hostId,
          game_id: game.id,
          name: playerName.trim(),
          score: 0,
          color: getAvailableColor([]), // First player gets first available color
        })

      if (playerError) throw playerError

      // Store player ID in session
      sessionStorage.setItem('playerId', hostId)
      sessionStorage.setItem('playerName', playerName.trim())

      router.push(`/game/${code}`)
    } catch (err) {
      console.error('Error creating game:', err)
      setError('Failed to create game. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const joinGame = async () => {
    if (!playerName.trim()) {
      setError('Skriv in ditt namn')
      return
    }

    if (!gameCode.trim()) {
      setError('Skriv in en spelkod')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Find game
      const { data: game, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('code', gameCode.toUpperCase())
        .single()

      if (gameError || !game) {
        setError('Game not found')
        setLoading(false)
        return
      }

      if (game.status !== 'waiting') {
        setError('Game already started')
        setLoading(false)
        return
      }

      // Get existing players to check for duplicate names and determine used colors
      const { data: existingPlayers } = await supabase
        .from('players')
        .select('name, color')
        .eq('game_id', game.id)

      // Check if player name already exists in the game
      if (existingPlayers?.some(p => p.name.toLowerCase() === playerName.trim().toLowerCase())) {
        setError('Någon annan i spelet har redan detta namnet')
        setLoading(false)
        return
      }

      const usedColors = existingPlayers?.map(p => p.color) || []

      // Add player
      const playerId = crypto.randomUUID()
      const { error: playerError } = await supabase
        .from('players')
        .insert({
          id: playerId,
          game_id: game.id,
          name: playerName.trim(),
          score: 0,
          color: getAvailableColor(usedColors),
        })

      if (playerError) {
        // Check if it's a unique constraint violation
        if (playerError.message.includes('unique_player_name_per_game') ||
            playerError.code === '23505') {
          setError('Någon annan i spelet har redan detta namnet')
          setLoading(false)
          return
        }
        throw playerError
      }

      // Store player ID in session
      sessionStorage.setItem('playerId', playerId)
      sessionStorage.setItem('playerName', playerName.trim())

      router.push(`/game/${gameCode.toUpperCase()}`)
    } catch (err) {
      console.error('Error joining game:', err)
      setError('Failed to join game. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-4xl font-bold text-center mb-2 text-gray-800">
          Närmast Vinner
        </h1>
        <p className="text-center text-gray-600 mb-8">
          Totalt orginellt spel för folk som gillar kartor
        </p>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Spelarnamn
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
              placeholder="Skriv in ett bra spelarnamn"
              maxLength={20}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Spelkod
            </label>
            <input
                type="text"
                value={gameCode}
                onChange={(e) => setGameCode(e.target.value.toUpperCase())}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
                placeholder="Skriv spelkod"
                maxLength={6}
            />
          </div>

          <button
              onClick={joinGame}
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
          >
            {loading ? 'Går med...' : 'Gå med i spel'}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Eller</span>
            </div>
          </div>
        </div>


        <button
            onClick={createGame}
            disabled={loading}
            className="mt-2.5 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
        >
          {loading ? 'Skapar...' : 'Skapa nytt spel'}
        </button>
      </div>
    </main>
  )
}

