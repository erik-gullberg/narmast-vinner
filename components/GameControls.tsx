'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/lib/database.types'

type Game = Database['public']['Tables']['games']['Row']

interface GameControlsProps {
  game: Game | null
  playerId: string | null
  playersCount: number
  /** True when the host has gone silent and anyone may advance the game. */
  canRescue: boolean
  /** Seconds until auto_advance fires, or null when it is not running. */
  autoIn: number | null
}

/**
 * Host controls.
 *
 * All game state transitions are server-side RPCs (see
 * supabase/migration_critical_fixes.sql). This component used to pick the next
 * event itself by fetching every event id, shuffling in JS, and firing serial
 * HEAD requests at the image URLs before each round could start. That is now a
 * single indexed query inside advance_round().
 */
export default function GameControls({
  game,
  playerId,
  playersCount,
  canRescue,
  autoIn,
}: GameControlsProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showQuitConfirmation, setShowQuitConfirmation] = useState(false)

  if (!game || !playerId) return null

  // Wraps every RPC so a failure surfaces in the UI instead of only in the
  // console, and so double clicks cannot fire the same transition twice.
  // Note: supabase.rpc() returns a thenable builder, not a real Promise.
  const run = async (
    fn: () => PromiseLike<{ error: { message: string } | null }>,
    fallbackMessage: string
  ) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const { error: rpcError } = await fn()
      if (rpcError) {
        console.error(fallbackMessage, rpcError)
        setError(rpcError.message || fallbackMessage)
      }
    } catch (err) {
      console.error(fallbackMessage, err)
      setError(fallbackMessage)
    } finally {
      setBusy(false)
    }
  }

  const startGame = () =>
    run(
      () => supabase.rpc('start_game', { p_game_id: game.id, p_player_id: playerId }),
      'Det gick inte att starta spelet.'
    )

  const startGuessing = () =>
    run(
      () => supabase.rpc('begin_guessing', { p_game_id: game.id, p_player_id: playerId }),
      'Det gick inte att starta gissningen.'
    )

  const nextRound = () =>
    run(
      () => supabase.rpc('advance_round', { p_game_id: game.id, p_player_id: playerId }),
      'Det gick inte att starta nästa runda.'
    )

  const endGame = async () => {
    await run(
      () => supabase.rpc('end_game', { p_game_id: game.id, p_player_id: playerId }),
      'Det gick inte att avsluta spelet.'
    )
    setShowQuitConfirmation(false)
  }

  const isPlaying = game.status === 'playing'

  return (
    <div className="bg-white rounded-lg shadow p-4 max-h-screen">
      <h3 className="font-bold text-lg mb-3 text-gray-800">Spelkontroller</h3>

      {canRescue && (
        <p className="mb-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Värden verkar ha lämnat spelet. Du kan föra spelet vidare.
        </p>
      )}

      {game.status === 'waiting' && (
        <button
          onClick={startGame}
          disabled={playersCount === 0 || busy}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation flex items-center justify-center gap-2"
        >
          {busy ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Startar...
            </>
          ) : 'Starta'}
        </button>
      )}

      {isPlaying && (
        <div className="space-y-4">
          {game.phase === 'showing_image' && (
            <button
              onClick={startGuessing}
              disabled={busy}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg disabled:opacity-50 touch-manipulation"
            >
              {autoIn !== null ? `Börja gissa (${autoIn}s)` : 'Börja gissa'}
            </button>
          )}

          {/* Advancing is only offered once the round is actually over, so the
              host can no longer cut the guessing phase short by accident. */}
          {game.phase === 'revealing' && (
            <button
              onClick={nextRound}
              disabled={busy}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-lg disabled:opacity-50 touch-manipulation"
            >
              {autoIn !== null ? `Nästa runda (${autoIn}s)` : 'Nästa runda'}
            </button>
          )}

          {game.phase === 'guessing' && (
            <p className="text-sm text-gray-600 text-center">
              {playersCount > 1
                ? 'Väntar på att alla ska gissa...'
                : 'Placera din nål på kartan'}
            </p>
          )}

          <button
            onClick={() => setShowQuitConfirmation(true)}
            disabled={busy}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-lg disabled:opacity-50 touch-manipulation"
          >
            Avsluta spel
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Quit confirmation dialog */}
      {showQuitConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-3">
              Avsluta spelet?
            </h3>
            <p className="text-gray-600 mb-6">
              Är du säker på att du vill avsluta? Spelet kommer avslutas för alla spelare.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowQuitConfirmation(false)}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-4 rounded-lg touch-manipulation"
              >
                Avbryt
              </button>
              <button
                onClick={endGame}
                disabled={busy}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-lg disabled:opacity-50 touch-manipulation"
              >
                Avsluta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
