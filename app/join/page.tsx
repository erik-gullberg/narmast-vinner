'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { getAvailableColor } from '@/lib/colors'

function JoinGameForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [playerName, setPlayerName] = useState('')
  const [gameCode, setGameCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const code = searchParams.get('code')
    if (code) setGameCode(code.toUpperCase())
  }, [searchParams])

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
      const { data: game, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('code', gameCode.toUpperCase())
        .single()

      if (gameError || !game) {
        setError('Spelet hittades inte')
        setLoading(false)
        return
      }

      if (game.status !== 'waiting') {
        setError('Spelet har redan börjat')
        setLoading(false)
        return
      }

      const { data: existingPlayers } = await supabase
        .from('players')
        .select('name, color')
        .eq('game_id', game.id)

      if (existingPlayers?.some(p => p.name.toLowerCase() === playerName.trim().toLowerCase())) {
        setError('Någon annan i spelet har redan detta namnet')
        setLoading(false)
        return
      }

      const usedColors = existingPlayers?.map(p => p.color) || []

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
        if (playerError.message.includes('unique_player_name_per_game') ||
            playerError.code === '23505') {
          setError('Någon annan i spelet har redan detta namnet')
          setLoading(false)
          return
        }
        throw playerError
      }

      sessionStorage.setItem('playerId', playerId)
      sessionStorage.setItem('playerName', playerName.trim())
      localStorage.setItem(`playerId_${gameCode.toUpperCase()}`, playerId)
      localStorage.setItem(`playerName_${gameCode.toUpperCase()}`, playerName.trim())

      router.push(`/game/${gameCode.toUpperCase()}`)
    } catch (err) {
      console.error('Error joining game:', err)
      setError('Det gick inte att gå med i spelet. Försök igen.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 pt-2 bg-gradient-to-br from-blue-50 to-indigo-100">
      <img
        className="mt-8 mb-4 animate-bounce [animation-duration:2s]"
        src="/logo.png"
        alt="Närmast Vinner logotyp - geografispel"
        width={80}
        height={80}
      />
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <div className="mb-6">
          <button
            onClick={() => router.push('/')}
            className="text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 touch-manipulation"
          >
            ← Tillbaka
          </button>
        </div>

        <h1 className="text-4xl font-bold text-center mb-6 text-gray-800">
          Gå med i spel
        </h1>

        <div className="space-y-6 mt-2" onKeyDown={(e) => { if (e.key === 'Enter' && !loading) joinGame() }}>
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
              autoComplete="off"
              autoFocus
            />
          </div>

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
              autoComplete="off"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            onClick={joinGame}
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
          >
            {loading ? 'Går med...' : 'Gå med i spel'}
          </button>
        </div>
      </div>
    </main>
  )
}

export default function JoinGamePage() {
  return (
    <Suspense>
      <JoinGameForm />
    </Suspense>
  )
}
