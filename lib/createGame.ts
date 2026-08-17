import { supabase } from './supabase'
import { generateGameCode } from './utils'
import { getAvailableColor } from './colors'

export type GameMode = 'highscore' | 'closest_wins'

export interface CreateGameOptions {
  playerName: string
  gameMode: GameMode
  maxRounds: number | null
  targetScore: number | null
  guessTimeSeconds: number
  /** Host client drives phase transitions on a timer instead of by button. */
  autoAdvance: boolean
  /** Skip the lobby and go straight into round 1. Used by solo mode. */
  startImmediately?: boolean
}

/**
 * Creates a game and adds the creator as host.
 *
 * Shared by /create and the solo button so the two cannot drift apart. Note
 * INSERT on games/players is still open to anon by design (see
 * migration_critical_fixes_part_b.sql); everything after creation goes through
 * the RPCs.
 */
export async function createGame(options: CreateGameOptions): Promise<string> {
  const code = generateGameCode()
  const hostId = crypto.randomUUID()

  const { data: game, error: gameError } = await supabase
    .from('games')
    .insert({
      code,
      host_id: hostId,
      status: 'waiting',
      current_round: 0,
      game_mode: options.gameMode,
      max_rounds: options.maxRounds,
      target_score: options.targetScore,
      guess_time_seconds: options.guessTimeSeconds,
      auto_advance: options.autoAdvance,
    })
    .select()
    .single()

  if (gameError) throw gameError

  const { error: playerError } = await supabase.from('players').insert({
    id: hostId,
    game_id: game.id,
    name: options.playerName,
    score: 0,
    color: getAvailableColor([]),
  })

  if (playerError) throw playerError

  sessionStorage.setItem('playerId', hostId)
  sessionStorage.setItem('playerName', options.playerName)
  localStorage.setItem(`playerId_${code}`, hostId)
  localStorage.setItem(`playerName_${code}`, options.playerName)

  // Solo players should never see a lobby telling them to invite friends.
  if (options.startImmediately) {
    const { error: startError } = await supabase.rpc('start_game', {
      p_game_id: game.id,
      p_player_id: hostId,
    })
    if (startError) throw startError
  }

  return code
}

/** Solo defaults: short, self-driving, no setup screen. */
export const SOLO_GAME: Omit<CreateGameOptions, 'playerName'> = {
  gameMode: 'highscore',
  maxRounds: 5,
  targetScore: null,
  guessTimeSeconds: 15,
  autoAdvance: true,
  startImmediately: true,
}
