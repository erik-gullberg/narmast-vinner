'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { generateGameCode } from '@/lib/utils'
import { getAvailableColor } from '@/lib/colors'
import Image from 'next/image'

type GameMode = 'highscore' | 'closest_wins'
type GameLength = 'kort' | 'medel' | 'lang' | 'maraton'

const GAME_LENGTH_CONFIG = {
  highscore: {
    kort: 5,
    medel: 10,
    lang: 20,
    maraton: null, // unlimited
  },
  closest_wins: {
    kort: 3,
    medel: 5,
    lang: 10,
    maraton: null, // unlimited
  },
}

export default function CreateGamePage() {
  const router = useRouter()
  const [gameMode, setGameMode] = useState<GameMode>('highscore')
  const [gameLength, setGameLength] = useState<GameLength>('medel')
  const [guessTime, setGuessTime] = useState<15 | 20 | 30>(15)
  const [playerName, setPlayerName] = useState('')
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

      // Determine max_rounds or target_score based on mode and length
      const config = GAME_LENGTH_CONFIG[gameMode][gameLength]
      const gameData: any = {
        code,
        host_id: hostId,
        status: 'waiting',
        current_round: 0,
        game_mode: gameMode,
        guess_time_seconds: guessTime,
      }

      if (gameMode === 'highscore') {
        gameData.max_rounds = config
        gameData.target_score = null
      } else {
        gameData.target_score = config
        gameData.max_rounds = null
      }

      // Create game
      const { data: game, error: gameError } = await supabase
        .from('games')
        .insert(gameData)
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
          color: getAvailableColor([]),
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

  const getGameLengthLabel = () => {
    const value = GAME_LENGTH_CONFIG[gameMode][gameLength]
    if (value === null) return 'Obegränsat'
    if (gameMode === 'highscore') {
      return `${value} ${value === 1 ? 'runda' : 'rundor'}`
    } else {
      return `${value} ${value === 1 ? 'poäng' : 'poäng'}`
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 pt-2 bg-gradient-to-br from-blue-50 to-indigo-100">
      <Image
        className="mt-8 mb-4 animate-bounce [animation-duration:2s]"
        src="/logo.png"
        alt="Närmast Vinner logotyp - geografispel"
        width={80}
        height={80}
        unoptimized
      />
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <div className="mb-6">
          <button
            onClick={() => router.push('/')}
            className="text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
          >
            ← Tillbaka
          </button>
        </div>

        <h1 className="text-4xl font-bold text-center mb-6 text-gray-800">
          Skapa Nytt Spel
        </h1>

        <div className="space-y-6 mt-2">
          {/* Game Mode Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Spelläge
            </label>
            <div className="space-y-3">
              <label className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${
                gameMode === 'highscore'
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-300'
              }`}>
                <input
                  type="radio"
                  name="gameMode"
                  value="highscore"
                  checked={gameMode === 'highscore'}
                  onChange={(e) => setGameMode(e.target.value as GameMode)}
                  className="sr-only"
                />
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">High Score</div>
                  <div className="text-sm text-gray-600">
                    Alla spelare får poäng baserat på hur nära de gissar målet.
                  </div>
                </div>
              </label>

              <label className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${
                gameMode === 'closest_wins'
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-300'
              }`}>
                <input
                  type="radio"
                  name="gameMode"
                  value="closest_wins"
                  checked={gameMode === 'closest_wins'}
                  onChange={(e) => setGameMode(e.target.value as GameMode)}
                  className="sr-only"
                />
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">Närmast Vinner</div>
                  <div className="text-sm text-gray-600">
                    Endast den som gissar närmast får 1 poäng.
                    <span className="block mt-1 text-amber-600 font-medium">
                      ⚠️ Bäst med flera spelare
                    </span>
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Game Length Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Spellängd
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(['kort', 'medel', 'lang', 'maraton'] as GameLength[]).map((length) => (
                <label
                  key={length}
                  className={`flex items-center justify-center gap-2 p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${
                    gameLength === length
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="gameLength"
                    value={length}
                    checked={gameLength === length}
                    onChange={(e) => setGameLength(e.target.value as GameLength)}
                    className="sr-only"
                  />
                  <div className="text-center">
                    <div className="font-semibold text-gray-900 capitalize">
                      {length === 'lang' ? 'Lång' : length === 'maraton' ? 'Maraton' : length.charAt(0).toUpperCase() + length.slice(1)}
                    </div>
                    <div className="text-xs text-gray-600">
                      {GAME_LENGTH_CONFIG[gameMode][length] === null
                        ? 'Obegränsat'
                        : gameMode === 'highscore'
                        ? `${GAME_LENGTH_CONFIG[gameMode][length]} rundor`
                        : `${GAME_LENGTH_CONFIG[gameMode][length]} poäng`}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Guess Time Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Gissningstid
            </label>
            <div className="grid grid-cols-3 gap-3">
              {([15, 20, 30] as const).map((time) => (
                <label
                  key={time}
                  className={`flex items-center justify-center gap-2 p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${
                    guessTime === time
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="guessTime"
                    value={time}
                    checked={guessTime === time}
                    onChange={(e) => setGuessTime(Number(e.target.value) as 15 | 20 | 30)}
                    className="sr-only"
                  />
                  <div className="font-semibold text-gray-900">{time}s</div>
                </label>
              ))}
            </div>
          </div>

          {/* Player Name Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ditt spelarnamn
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
              placeholder="Skriv in ditt namn"
              maxLength={20}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Summary */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
            <div className="text-sm font-medium text-indigo-900 mb-2">Sammanfattning:</div>
            <ul className="text-sm text-indigo-800 space-y-1">
              <li>• {gameMode === 'highscore' ? 'High Score' : 'Närmast Vinner'}</li>
              <li>• {getGameLengthLabel()}</li>
              <li>• {guessTime} sekunder per gissning</li>
            </ul>
          </div>

          <button
            onClick={createGame}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
          >
            {loading ? 'Skapar spel...' : 'Skapa Spel'}
          </button>
        </div>
      </div>
    </main>
  )
}

