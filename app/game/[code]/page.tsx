'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { Database } from '@/lib/database.types'
import EventDisplay from '@/components/EventDisplay'
import PlayerList from '@/components/PlayerList'
import GameControls from '@/components/GameControls'


const Results = dynamic(() => import('@/components/Results'), { ssr: false })

const MapComponent = dynamic(() => import('@/components/MapComponent'), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-lg shadow overflow-hidden flex flex-col">
      <div className="relative flex-1" style={{ minHeight: '400px', height: '60vh' }}>
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-500">Loading map...</p>
        </div>
      </div>
    </div>
  ),
})

type Game = Database['public']['Tables']['games']['Row']
type Player = Database['public']['Tables']['players']['Row']
type Event = Database['public']['Tables']['events']['Row']
type Guess = Database['public']['Tables']['guesses']['Row']

export default function GamePage() {
  const params = useParams()
  const router = useRouter()
  const gameCode = params.code as string

  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [hasGuessed, setHasGuessed] = useState(false)
  const [timeLeft, setTimeLeft] = useState(15)
  const [showResults, setShowResults] = useState(false)
  const [guesses, setGuesses] = useState<Guess[]>([])
  const [loading, setLoading] = useState(true)

  // Get player ID from session
  useEffect(() => {
    const id = sessionStorage.getItem('playerId')
    if (!id) {
      router.push('/')
      return
    }
    setPlayerId(id)
  }, [router])

  // Load game data
  useEffect(() => {
    if (!gameCode) return

    const loadGame = async () => {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('code', gameCode)
        .single()

      if (error || !data) {
        console.error('Game not found:', error)
        router.push('/')
        return
      }

      setGame(data)
      setLoading(false)
    }

    loadGame()
  }, [gameCode, router])

  // Subscribe to game updates
  useEffect(() => {
    if (!game) return

    const channel = supabase
      .channel(`game:${game.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${game.id}`,
        },
        (payload) => {
          setGame(payload.new as Game)
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `game_id=eq.${game.id}`,
        },
        () => {
          loadPlayers()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'guesses',
          filter: `game_id=eq.${game.id}`,
        },
        () => {
          loadGuesses()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [game])

  // Load players
  const loadPlayers = async () => {
    if (!game) return

    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', game.id)
      .order('score', { ascending: false })

    if (data && !error) {
      setPlayers(data)
    }
  }

  // Load current event
  const loadCurrentEvent = async () => {
    if (!game || !game.current_event_id) return

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', game.current_event_id)
      .single()

    if (data && !error) {
      setCurrentEvent(data)
    }
  }

  // Load guesses for current round
  const loadGuesses = async () => {
    if (!game) return

    const { data, error } = await supabase
      .from('guesses')
      .select('*')
      .eq('game_id', game.id)
      .eq('round', game.current_round)

    if (data && !error) {
      setGuesses(data)
    }
  }

  useEffect(() => {
    loadPlayers()
  }, [game])

  useEffect(() => {
    loadCurrentEvent()
  }, [game?.current_event_id])

  // Timer logic
  useEffect(() => {
    if (game?.status !== 'playing' || game?.phase !== 'guessing' || hasGuessed) return

    setTimeLeft(15)
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [game?.status, game?.phase, game?.current_round, hasGuessed])

  // Check if all players have guessed
  useEffect(() => {
    if (!game || game.status !== 'playing') return

    loadGuesses()

    const checkAllGuessed = async () => {
      const { data: roundGuesses } = await supabase
        .from('guesses')
        .select('player_id')
        .eq('game_id', game.id)
        .eq('round', game.current_round)

      if (roundGuesses && roundGuesses.length === players.length && players.length > 0) {
        setShowResults(true)
      }
    }

    checkAllGuessed()
  }, [guesses.length, players.length, game])

  // Reset view when round changes
  useEffect(() => {
    if (!game) return
    setShowResults(false)
    setHasGuessed(false)
  }, [game?.current_round])

  const isHost = playerId === game?.host_id

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading game...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Närmast Vinner</h1>
            <p className="text-sm text-gray-600">Game Code: <span className="font-mono font-bold">{gameCode}</span></p>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl mx-auto w-full p-4 gap-4">
        {/* Sidebar */}
        <aside className="lg:w-80 space-y-4">
          <PlayerList players={players} currentPlayerId={playerId} />

          {isHost && (
            <GameControls
              game={game}
              playersCount={players.length}
              onShowResults={() => setShowResults(true)}
            />
          )}
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col gap-4">
          {game?.status === 'waiting' && (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <h2 className="text-2xl font-bold mb-4">Waiting for players...</h2>
              <p className="text-gray-600 mb-4">
                Share the game code <span className="font-mono font-bold text-xl">{gameCode}</span> with your friends!
              </p>
              <p className="text-sm text-gray-500">
                {players.length} player{players.length !== 1 ? 's' : ''} joined
              </p>
            </div>
          )}

          {game?.status === 'playing' && currentEvent && game.phase === 'showing_image' && (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <h2 className="text-gray-600 text-2xl font-bold mb-4">Round {game.current_round}</h2>
              <p className="text-gray-600 mb-6">Study the image carefully!</p>
              <EventDisplay event={currentEvent} showDetails={false} />
              {!isHost && (
                <p className="text-gray-500 mt-6">Waiting for host to start guessing...</p>
              )}
            </div>
          )}

          {game?.status === 'playing' && game?.phase === 'guessing' && !hasGuessed && (
              <div className="text-right">
                <div className="text-sm text-gray-600">Time left</div>
                <div className="text-3xl font-bold text-indigo-600">{timeLeft}s</div>
              </div>
          )}

          {game?.status === 'playing' && currentEvent && game.phase === 'guessing' && !showResults && (
            <>
              <MapComponent
                gameId={game.id}
                playerId={playerId!}
                eventId={currentEvent.id}
                round={game.current_round}
                onGuess={() => setHasGuessed(true)}
                disabled={hasGuessed || timeLeft === 0}
              />
            </>
          )}

          {showResults && currentEvent && (
            <Results
              event={currentEvent}
              guesses={guesses}
              players={players}
              isHost={isHost}
              onNextRound={() => {
                setShowResults(false)
                setHasGuessed(false)
              }}
            />
          )}

          {game?.status === 'finished' && (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <h2 className="text-3xl font-bold mb-4">Game Over!</h2>
              <h3 className="text-xl mb-4">Final Scores</h3>
              <div className="space-y-2">
                {players.map((player, index) => (
                  <div
                    key={player.id}
                    className="flex justify-between items-center p-3 bg-gray-50 rounded"
                  >
                    <span className="font-semibold">
                      {index + 1}. {player.name}
                    </span>
                    <span className="text-indigo-600 font-bold">{player.score} points</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => router.push('/')}
                className="mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg"
              >
                New Game
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

