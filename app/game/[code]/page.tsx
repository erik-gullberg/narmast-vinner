'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { Database } from '@/lib/database.types'
import EventDisplay from '@/components/EventDisplay'
import PlayerList from '@/components/PlayerList'
import GameControls from '@/components/GameControls'
import Image from "next/image";


const Results = dynamic(() => import('@/components/Results'), { ssr: false })

const MapComponent = dynamic(() => import('@/components/MapComponent'), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-lg shadow overflow-hidden flex flex-col">
      <div className="relative flex-1" style={{ minHeight: '500px', height: '75vh' }}>
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
  const [waitingForResults, setWaitingForResults] = useState(false)

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

  const getMedal = (placement: number) => {
    switch (placement) {
      case 0: return '🥇'
      case 1: return '🥈'
      case 2: return '🥉'
      default: return ''
    }
  }

  useEffect(() => {
    loadPlayers()
  }, [game])

  useEffect(() => {
    loadCurrentEvent()
  }, [game?.current_event_id])

  // Timer logic - calculate based on server timestamp
  useEffect(() => {
    if (game?.status !== 'playing' || game?.phase !== 'guessing' || !game.phase_started_at) return

    let bufferTriggered = false

    const updateTimer = () => {
      const startTime = new Date(game.phase_started_at!).getTime()
      const now = Date.now()
      const elapsed = Math.floor((now - startTime) / 1000)
      const remaining = Math.max(0, 15 - elapsed)
      setTimeLeft(remaining)

      // Auto-show results when timer expires (only trigger once)
      if (remaining === 0 && !bufferTriggered && !showResults && !waitingForResults) {
        bufferTriggered = true
        setWaitingForResults(true)
        // 5 second buffer to ensure all auto-submissions sync across clients
        setTimeout(() => {
          setShowResults(true)
          setWaitingForResults(false)
        }, 5000)
      }
    }

    // Update immediately
    updateTimer()

    // Update every 100ms for smooth countdown
    const timer = setInterval(updateTimer, 100)

    return () => clearInterval(timer)
  }, [game?.status, game?.phase, game?.current_round, game?.phase_started_at, showResults, waitingForResults])

  // Check if all players have guessed (show results early if everyone is done)
  useEffect(() => {
    if (!game || game.status !== 'playing' || game.phase !== 'guessing') return

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
    setWaitingForResults(false)
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
      {game?.status !== 'playing' && (
        <header className="bg-white shadow-sm p-4">
          <div className="gap-4 mx-auto flex items-center">
            <Image src={'/logo.png'} alt={'Närmast Vinner logotyp - geografispel'} width={40} height={40} />
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Närmast Vinner</h1>
              <p className="text-sm text-gray-600">Spelkod: <span className="font-mono font-bold">{gameCode}</span></p>
            </div>
          </div>
        </header>
      )}

      <div className="flex-1 flex flex-col lg:flex-row max-w-[1920px] mx-auto w-full p-4 gap-4">
        {isHost && game?.status !== 'finished' && (
            <GameControls
                game={game}
                playersCount={players.length}
                onShowResults={() => setShowResults(true)}
            />
        )}
        {/* Sidebar */}
        <aside className="lg:w-80 space-y-4">
          {game?.status === 'playing' && game?.phase === 'guessing' && (
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-center">
                <div className="text-sm text-gray-600 mb-1">Tid</div>
                <div className={`text-5xl font-bold ${timeLeft <= 5 ? 'text-red-600 animate-pulse' : 'text-indigo-600'}`}>
                  {timeLeft}s
                </div>
              </div>
            </div>
          )}
          {game?.status === 'waiting' && (
            <PlayerList players={players} currentPlayerId={playerId} gameStatus={game.status} />
          )}
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col gap-4">
          {game?.status === 'waiting' && (
            <>
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <h2 className="text-gray-600 text-2xl font-bold mb-4">Väntar på att starta...</h2>
              <p className="text-gray-600 mb-4">
                Dela spelkoden <span className="font-mono font-bold text-xl">{gameCode}</span> med dina vänner för att spela tilsammans!
              </p>
            </div>
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <h2 className="text-gray-600 text-xl font-bold mb-4">Regler</h2>
                <ul>
                  <li className={"text-gray-600"}>Spelare får se en bild av en händelse eller plats</li>
                  <li className={"text-gray-600"}>Alla får 15 sekunder på sig att placera ut händelsen på en världskarta</li>
                  <li className={"text-gray-600"}>1000 poäng för fullträff, 1 minuspoäng per km ifrån </li>
                </ul>
              </div>
              </>
          )}

          {game?.status === 'playing' && currentEvent && game.phase === 'showing_image' && (
            <div key={`event-display-${currentEvent.id}`} className="bg-white rounded-lg shadow pt-8 pb-8 pl-2 pr-2 text-center">
              <h2 className="text-gray-600 text-2xl font-bold mb-4 flex items-center justify-center gap-2">
                <span>Runda {game.current_round}</span>
              </h2>
              <EventDisplay key={currentEvent.id} event={currentEvent} />
            </div>
          )}

          {game?.status === 'playing' && currentEvent && game.phase === 'showing_image' && (
              <div className="bg-white rounded-lg shadow pb-8 pl-2 pr-2 text-center">
                <PlayerList players={players} currentPlayerId={playerId} gameStatus={game.status}/></div>
          )}

          {game?.status === 'playing' && currentEvent && game.phase === 'guessing' && !showResults && (
            <>
              {waitingForResults && (
                <div className="bg-white rounded-lg shadow p-8 text-center">
                  <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-800 mb-2">Samlar in alla svar...</h3>
                    </div>
                  </div>
                </div>
              )}
              <div className={waitingForResults ? 'hidden' : ''}>
                <MapComponent
                  gameId={game.id}
                  playerId={playerId!}
                  eventId={currentEvent.id}
                  round={game.current_round}
                  onGuess={() => setHasGuessed(true)}
                  disabled={hasGuessed || timeLeft === 0}
                />
              </div>
            </>
          )}

          {showResults && currentEvent && game?.status !== 'finished' && (
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
              <h2 className="text-black text-3xl font-bold mb-4">Game Over!</h2>
              <h3 className="text-black text-xl mb-4">Slutpoäng</h3>
              <div className="space-y-2">
                {players.map((player, index) => (
                  <div
                    key={player.id}
                    className="flex justify-between items-center p-3 bg-gray-50 rounded"
                  >
                    <span className="text-black font-semibold">
                      {getMedal(index)} {index + 1}. {player.name}
                    </span>
                    <span className="text-indigo-600 font-bold">{player.score} points</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => router.push('/')}
                className="mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg"
              >
                Tillbaka till start
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

