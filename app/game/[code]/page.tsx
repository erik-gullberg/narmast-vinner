'use client'

import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { Database } from '@/lib/database.types'
import EventDisplay from '@/components/EventDisplay'
import PlayerList from '@/components/PlayerList'
import GameControls from '@/components/GameControls'
import { planAutoAdvance } from '@/lib/autoAdvance'

const ResultsMap = dynamic(
  () => import('@/components/Results').then((mod) => mod.ResultsMap),
  { ssr: false }
)
const ResultsList = dynamic(
  () => import('@/components/Results').then((mod) => mod.ResultsList),
  { ssr: false }
)

const MapComponent = dynamic(() => import('@/components/MapComponent'), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-lg shadow overflow-hidden flex flex-col h-full">
      <div className="relative flex-1 min-h-0">
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-500">Laddar karta...</p>
        </div>
      </div>
    </div>
  ),
})

type Game = Database['public']['Tables']['games']['Row']
type Player = Database['public']['Tables']['players']['Row']
type Event = Database['public']['Tables']['events']['Row']
type Guess = Database['public']['Tables']['guesses']['Row']

/** Matches game_is_stalled() in the database. */
const STALL_MS = 90_000


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
  const [guesses, setGuesses] = useState<Guess[]>([])
  const [loading, setLoading] = useState(true)
  const [hostStalled, setHostStalled] = useState(false)
  /** Seconds until auto_advance moves the game on, or null when inactive. */
  const [autoIn, setAutoIn] = useState<number | null>(null)
  /**
   * When a picture actually appeared on screen, tagged with the event it
   * belongs to.
   *
   * The tag matters. This used to be a bare timestamp, which meant that on the
   * render where the round advanced, the auto-advance effect below still saw
   * the *previous* round's value — roughly 24 seconds old by then — computed a
   * deadline already in the past, and skipped straight past the new picture.
   * Resetting it in a separate effect did not help, because effects run in
   * declaration order and auto-advance is declared first. Tagging the event id
   * makes the check correct regardless of ordering.
   */
  const [imageReady, setImageReady] = useState<{ eventId: string; at: number } | null>(null)

  // The realtime channel is subscribed once per game id. Its callbacks would
  // otherwise close over a stale `game` and keep reading round 1 forever, so
  // they read through this ref instead.
  const gameRef = useRef<Game | null>(null)
  useEffect(() => {
    gameRef.current = game
  }, [game])

  // Get player ID from session or localStorage (rejoin after refresh/tab close)
  useEffect(() => {
    let id = sessionStorage.getItem('playerId')
    if (!id && gameCode) {
      // Try to restore from localStorage (persists across tab closes)
      const storedId = localStorage.getItem(`playerId_${gameCode.toUpperCase()}`)
      if (storedId) {
        id = storedId
        sessionStorage.setItem('playerId', id)
        const storedName = localStorage.getItem(`playerName_${gameCode.toUpperCase()}`)
        if (storedName) sessionStorage.setItem('playerName', storedName)
      }
    }
    if (!id) {
      router.push('/')
      return
    }
    setPlayerId(id)
  }, [router, gameCode])

  const loadPlayers = useCallback(async (gameId: string) => {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', gameId)
      .order('score', { ascending: false })

    if (data && !error) setPlayers(data)
  }, [])

  const loadGuesses = useCallback(async (gameId: string, round: number) => {
    const { data, error } = await supabase
      .from('guesses')
      .select('*')
      .eq('game_id', gameId)
      .eq('round', round)

    if (data && !error) setGuesses(data)
  }, [])

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

  // Subscribe to game updates.
  //
  // Keyed on game.id, not on the whole game object. Keying on `game` tore the
  // channel down and rebuilt it on every single state change, which meant
  // messages could be dropped during the resubscribe window.
  useEffect(() => {
    const gameId = game?.id
    if (!gameId) return

    const channel = supabase
      .channel(`game:${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload) => setGame(payload.new as Game)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` },
        () => loadPlayers(gameId)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'guesses', filter: `game_id=eq.${gameId}` },
        () => loadGuesses(gameId, gameRef.current?.current_round ?? 1)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [game?.id, loadPlayers, loadGuesses])

  // Load players once the game is known
  useEffect(() => {
    if (game?.id) loadPlayers(game.id)
  }, [game?.id, loadPlayers])

  // Load current event
  useEffect(() => {
    const eventId = game?.current_event_id
    if (!eventId) return

    supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single()
      .then(({ data, error }) => {
        if (data && !error) setCurrentEvent(data)
      })
  }, [game?.current_event_id])

  // Load guesses whenever the round or phase changes
  useEffect(() => {
    if (game?.id && game.current_round > 0) {
      loadGuesses(game.id, game.current_round)
    }
  }, [game?.id, game?.current_round, game?.phase, loadGuesses])

  const isHost = playerId === game?.host_id
  const isGuessing = game?.status === 'playing' && game?.phase === 'guessing'
  const isRevealing = game?.status === 'playing' && game?.phase === 'revealing'

  // Countdown. Display only — the server owns the real deadline, so a wrong
  // device clock can no longer buy a player extra time.
  useEffect(() => {
    if (!isGuessing || !game?.phase_started_at) return

    const limit = game.guess_time_seconds || 15
    const startTime = new Date(game.phase_started_at).getTime()

    const tick = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      setTimeLeft(Math.max(0, limit - elapsed))
    }

    tick()
    const timer = setInterval(tick, 250)
    return () => clearInterval(timer)
  }, [isGuessing, game?.phase_started_at, game?.guess_time_seconds, game?.current_round])

  // Close the round when it is genuinely over.
  //
  // Every client may call this; close_round() is idempotent and refuses to
  // close early unless everyone has actually answered, so the fastest clock in
  // the room cannot cut the round short for the others.
  const everyoneGuessed = players.length > 0 && guesses.length >= players.length

  useEffect(() => {
    if (!isGuessing || !game?.id) return
    if (!everyoneGuessed && timeLeft > 0) return

    const gameId = game.id
    let cancelled = false

    const attempt = async () => {
      // Must be awaited. supabase.rpc() returns a lazy PromiseLike builder that
      // only issues the HTTP request when it is thened — calling it without
      // awaiting sends nothing at all and the round never closes.
      const { error: rpcError } = await supabase.rpc('close_round', {
        p_game_id: gameId,
      })
      if (rpcError && !cancelled) {
        console.error('close_round failed:', rpcError)
      }
    }

    // Small delay on the timeout path lets in-flight submissions land first.
    const first = setTimeout(attempt, everyoneGuessed ? 0 : 2000)

    // close_round can legitimately decline to close (for example the server
    // clock says the window is not up yet). Nothing else would re-trigger this
    // effect, so retry until it takes. It is idempotent, and this effect is
    // torn down the moment the phase leaves `guessing`.
    const retry = setInterval(attempt, 3000)

    return () => {
      cancelled = true
      clearTimeout(first)
      clearInterval(retry)
    }
  }, [isGuessing, game?.id, everyoneGuessed, timeLeft === 0])

  // Auto-advance (§6.4).
  //
  // Always on for solo games, opt-in for multiplayer. Only the host's client
  // drives it so N players do not all fire the same transition; if the host
  // leaves, the 90s stall rescue below takes over.
  //
  // The deadline is derived from phase_started_at, which the server stamps on
  // every transition including the reveal, so all clients count down together.
  const autoAdvanceActive =
    !!game?.auto_advance &&
    isHost &&
    game?.status === 'playing' &&
    (game.phase === 'showing_image' || game.phase === 'revealing')

  useEffect(() => {
    if (!autoAdvanceActive || !game?.id || !playerId || !game.phase_started_at) {
      setAutoIn(null)
      return
    }

    const isImage = game.phase === 'showing_image'
    const gameId = game.id

    // See lib/autoAdvance.ts. The reveal counts from the moment the server
    // closed the round; the picture counts from when it is actually visible.
    const { deadline, waitingForImage } = planAutoAdvance({
      phase: isImage ? 'showing_image' : 'revealing',
      phaseStartedAt: new Date(game.phase_started_at).getTime(),
      currentEventId: game.current_event_id,
      imageReady,
    })

    let fired = false

    const tick = async () => {
      const remaining = deadline - Date.now()
      // No countdown while the picture is still loading — showing one would be
      // a promise we cannot keep.
      setAutoIn(waitingForImage ? null : Math.max(0, Math.ceil(remaining / 1000)))

      if (remaining <= 0 && !fired) {
        fired = true
        const { error: rpcError } = await supabase.rpc(
          isImage ? 'begin_guessing' : 'advance_round',
          { p_game_id: gameId, p_player_id: playerId }
        )
        if (rpcError) {
          console.error('auto-advance failed:', rpcError)
          // Back off before retrying; the tick runs every 250ms and we do not
          // want to hammer the API if this fails persistently.
          setTimeout(() => { fired = false }, 2000)
        }
      }
    }

    tick()
    const timer = setInterval(tick, 250)
    return () => clearInterval(timer)
  }, [
    autoAdvanceActive,
    game?.id,
    game?.phase,
    game?.phase_started_at,
    game?.current_event_id,
    playerId,
    imageReady,
  ])

  // Records which picture became visible and when. Tagged with the event id so
  // a stale value from the previous round can never be mistaken for this one's;
  // no separate reset effect is needed.
  const handleImageReady = useCallback((eventId: string) => {
    setImageReady((prev) =>
      prev?.eventId === eventId ? prev : { eventId, at: Date.now() }
    )
  }, [])

  // Detect an absent host so the game can still be advanced (§4.2).
  useEffect(() => {
    if (!game || game.status === 'finished' || isHost) {
      setHostStalled(false)
      return
    }

    const check = () => {
      const last = new Date(game.phase_started_at ?? game.created_at).getTime()
      setHostStalled(Date.now() - last > STALL_MS)
    }

    check()
    const timer = setInterval(check, 5000)
    return () => clearInterval(timer)
  }, [game, isHost])

  // Reset per-round view state, and re-detect an existing guess after a refresh
  useEffect(() => {
    if (!game) return
    setHasGuessed(false)

    if (playerId && game.id && game.current_round > 0) {
      supabase
        .from('guesses')
        .select('id')
        .eq('game_id', game.id)
        .eq('player_id', playerId)
        .eq('round', game.current_round)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setHasGuessed(true)
        })
    }
  }, [game?.current_round, game?.id, playerId])

  const getMedal = (placement: number) => {
    switch (placement) {
      case 0: return '🥇'
      case 1: return '🥈'
      case 2: return '🥉'
      default: return ''
    }
  }

  const myColor = players.find((p) => p.id === playerId)?.color || 'blue'
  const showControls = (isHost || hostStalled) && game?.status !== 'finished'
  const guessedCount = guesses.length

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Laddar spel...</div>
      </div>
    )
  }

  // Mobile: compact horizontal bar so the timer doesn't cost the map any more
  // height than "Tid  8s  ·  2 av 4 har gissat" needs. Desktop keeps the
  // original big stacked card since it has room to spare.
  const timerPanel = (
    <div className="bg-white rounded-lg shadow p-3 lg:p-4">
      <div className="flex items-center justify-center gap-4 lg:block lg:text-center">
        <div className="flex items-baseline gap-2 lg:flex-col lg:items-center lg:gap-0">
          <span className="text-sm text-gray-600 lg:mb-1">Tid</span>
          <span
            className={`text-3xl lg:text-5xl font-bold tabular-nums ${timeLeft <= 5 ? 'text-red-600 animate-pulse' : 'text-indigo-600'}`}
            aria-live="polite"
          >
            <span className="inline-block min-w-[2ch] text-center">{timeLeft}</span>s
          </span>
        </div>
        {players.length > 1 && (
          <div className="text-sm text-gray-600 lg:mt-2">
            {guessedCount} av {players.length} har gissat
          </div>
        )}
      </div>
    </div>
  )

  const isPlaying = game?.status === 'playing'

  // The reveal is exempt from the viewport lock on mobile only: cramming the
  // results list and "Nästa runda" into the same fixed-height sidebar as the
  // map forced a tiny nested scrollbox. Letting the page itself scroll here
  // means the results are shown at their natural size and the controls are
  // simply further down, not squeezed. Desktop's sidebar was never height
  // -constrained (lg:max-h-none), so it keeps the locked layout unchanged.
  const rootHeightClasses = !isPlaying
    ? 'min-h-screen'
    : isRevealing
      ? 'min-h-screen lg:h-[100dvh] lg:overflow-hidden'
      : 'h-[100dvh] overflow-hidden'

  // Rendered twice: as a slim standalone strip above the map on mobile (the
  // user asked for round number, then map, then the rest), and again inside
  // the sidebar so desktop keeps one column with round on top.
  const roundBar = isPlaying && (
    <div className="bg-white rounded-lg shadow py-1.5 lg:py-3 px-3 text-center shrink-0">
      <h2 className="text-gray-600 text-sm lg:text-lg font-bold">Runda {game.current_round}</h2>
    </div>
  )

  const showPlayerList =
    game?.status === 'waiting' || (isPlaying && game.phase === 'showing_image')

  // Sidebar holds every secondary panel (round, timer, controls, scoreboard,
  // results list) so the media in <main> can take all the leftover space
  // instead of a fixed vh guess. Ordered after <main> in the DOM so mobile
  // sees the picture first and the controls below it; lg:order-first puts it
  // back on the left on desktop.
  //
  // Timer and controls are shrink-0 so they can never be scrolled out of
  // view — only the scoreboard/results list at the bottom scrolls, and only
  // once it runs out of room.
  const sidebar = (
    <aside
      className={`order-3 lg:order-1 lg:w-96 lg:shrink-0 flex flex-col gap-3 ${
        isRevealing ? 'lg:min-h-0 lg:max-h-none' : 'min-h-0 max-h-[40dvh] lg:max-h-none'
      }`}
    >
      <div className="hidden lg:block">{roundBar}</div>

      {isGuessing && <div className="shrink-0">{timerPanel}</div>}

      {/* On the reveal, results outrank the "next round" button on mobile —
          swapped to after it via order; desktop keeps controls-then-list via
          lg:order-1/2, matching the DOM order used on every other phase. */}
      {showControls && (
        <div className={`shrink-0 ${isRevealing ? 'order-2 lg:order-1' : ''}`}>
          <GameControls
            game={game}
            playerId={playerId}
            playersCount={players.length}
            canRescue={!isHost && hostStalled}
            autoIn={autoIn}
          />
        </div>
      )}

      <div
        className={
          isRevealing
            ? 'flex flex-col gap-3 order-1 lg:order-2 lg:flex-1 lg:min-h-0 lg:overflow-y-auto'
            : 'flex-1 min-h-0 overflow-y-auto flex flex-col gap-3'
        }
      >
        {showPlayerList && (
          <PlayerList players={players} currentPlayerId={playerId} gameStatus={game!.status} />
        )}

        {/* Kept off mobile during guessing (§ layout follow-up): the timer
            panel already reports "x av y har gissat", and the map needs the
            space more than a second copy of the scoreboard does. */}
        {isGuessing && (
          <div className="hidden lg:block">
            <PlayerList players={players} currentPlayerId={playerId} gameStatus={game!.status} />
          </div>
        )}

        {isRevealing && currentEvent && game && (
          <ResultsList event={currentEvent} guesses={guesses} players={players} game={game} />
        )}
      </div>
    </aside>
  )

  const showSidebar =
    showControls ||
    game?.status === 'waiting' ||
    (isPlaying && game.phase === 'showing_image') ||
    isGuessing ||
    isRevealing

  return (
    <div className={`${rootHeightClasses} bg-gray-100 flex flex-col`}>
      {game?.status !== 'playing' && (
        <header className="bg-white shadow-sm p-4">
          <div className="gap-4 mx-auto flex items-center">
            <img src="/logo.png" alt="Närmast Vinner logotyp - geografispel" width={40} height={40} />
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Närmast Vinner</h1>
              <p className="text-sm text-gray-600">Spelkod: <span className="font-mono font-bold">{gameCode}</span></p>
            </div>
          </div>
        </header>
      )}

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row max-w-[1920px] mx-auto w-full p-4 gap-4">
        {roundBar && <div className="order-1 lg:hidden">{roundBar}</div>}

        {/* Main content: media only while playing, full-width cards otherwise */}
        <main className="order-2 flex-1 min-w-0 min-h-0 flex flex-col gap-4">
          {game?.status === 'waiting' && (
            <>
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <h2 className="text-gray-600 text-2xl font-bold mb-4">Väntar på att starta...</h2>
                <p className="text-gray-600 mb-4">
                  Dela spelkoden <span className="font-mono font-bold text-xl">{gameCode}</span> med dina vänner för att spela tillsammans!
                </p>
              </div>
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <h2 className="text-gray-600 text-xl font-bold mb-4">Regler</h2>
                {game.game_mode === 'highscore' ? (
                  <ul className="text-center space-y-2">
                    <li className={"text-gray-600"}>• Spelare får se en bild av en händelse eller plats</li>
                    <li className={"text-gray-600"}>• Alla får {game.guess_time_seconds || 15} sekunder på sig att placera ut händelsen på en världskarta</li>
                    <li className={"text-gray-600"}>• 1000 poäng för fullträff — ju närmare du gissar, desto mer poäng</li>
                  </ul>
                ) : (
                  <ul className="text-center space-y-2">
                    <li className={"text-gray-600"}>• Spelare får se en bild av en händelse eller plats</li>
                    <li className={"text-gray-600"}>• Alla får {game.guess_time_seconds || 15} sekunder på sig att placera ut händelsen på en världskarta</li>
                    <li className={"text-gray-600"}>• Endast spelaren som gissar närmast får 1 poäng</li>
                    <li className={"text-gray-600"}>• Först till {game.target_score || 'obegränsat'} poäng vinner!</li>
                  </ul>
                )}
              </div>
            </>
          )}

          {game?.status === 'playing' && currentEvent && game.phase === 'showing_image' && (
            <div className="flex-1 min-h-0">
              <EventDisplay
                key={currentEvent.id}
                event={currentEvent}
                onReady={handleImageReady}
              />
            </div>
          )}

          {isGuessing && currentEvent && playerId && (
            <div className="flex-1 min-h-0">
              <MapComponent
                gameId={game!.id}
                playerId={playerId}
                round={game!.current_round}
                playerColor={myColor}
                onGuess={() => setHasGuessed(true)}
                disabled={hasGuessed}
                timeUp={timeLeft === 0}
              />
            </div>
          )}

          {isRevealing && currentEvent && game && (
            <div className="h-[50dvh] lg:h-auto lg:flex-1 lg:min-h-0">
              <ResultsMap event={currentEvent} guesses={guesses} players={players} />
            </div>
          )}

          {game?.status === 'finished' && (
            <div className="bg-white rounded-lg shadow p-8 text-center flex flex-col items-center">
              <h2 className="text-black text-3xl font-bold mb-2">🏁 Spelet är slut!</h2>
              <h3 className="text-black text-xl mb-6">Slutpoäng</h3>
              <div className="space-y-3 w-full max-w-md">
                {players.map((player, index) => (
                  <div
                    key={player.id}
                    className={`flex justify-between items-center p-4 rounded-lg ${
                      index === 0 ? 'bg-yellow-100 border-2 border-yellow-400' : 'bg-gray-50'
                    }`}
                  >
                    <span className="text-black font-semibold">
                      {getMedal(index)} {index + 1}. {player.name}
                    </span>
                    <span className="text-indigo-600 font-bold">{player.score} poäng</span>
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

        {showSidebar && sidebar}
      </div>
    </div>
  )
}
