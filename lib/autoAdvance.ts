/**
 * Auto-advance timing.
 *
 * Extracted from the effect in app/game/[code]/page.tsx purely so it can be
 * tested. It is the piece that decides when an auto_advance game moves on, and
 * getting it wrong costs the player the round's only clue — which is exactly
 * what happened when a stale readiness timestamp from the previous round made
 * the deadline land in the past, skipping the picture entirely.
 */

/** Time on the picture, measured from when it is actually visible. */
export const AUTO_IMAGE_MS = 6_000

/** Time on the reveal, measured from when the server closed the round. */
export const AUTO_REVEAL_MS = 9_000

/**
 * Floor on how long the picture stays up, measured from the start of the phase
 * regardless of what the load tracking reports. Purely defensive: any future
 * mistake in the readiness logic degrades to "shown briefly" rather than
 * "not shown at all".
 */
export const MIN_IMAGE_VIEW_MS = 2_500

/**
 * Ceiling on waiting for an image before advancing anyway. Only reached if the
 * picture neither loads nor errors — a hung request rather than a failed one —
 * which would otherwise strand the game forever.
 */
export const MAX_IMAGE_WAIT_MS = 20_000

export interface ImageReady {
  eventId: string
  at: number
}

export interface AutoAdvanceInput {
  phase: 'showing_image' | 'revealing'
  /** ms epoch of games.phase_started_at */
  phaseStartedAt: number
  /** games.current_event_id */
  currentEventId: string | null
  /** Most recent picture-visible report, tagged with the event it belongs to. */
  imageReady: ImageReady | null
}

export interface AutoAdvancePlan {
  /** ms epoch at which the phase should advance. */
  deadline: number
  /** True while we are still waiting for the picture; suppresses the countdown. */
  waitingForImage: boolean
}

export function planAutoAdvance(input: AutoAdvanceInput): AutoAdvancePlan {
  const { phase, phaseStartedAt, currentEventId, imageReady } = input

  if (phase === 'revealing') {
    return { deadline: phaseStartedAt + AUTO_REVEAL_MS, waitingForImage: false }
  }

  // Only trust readiness reported for the event we are actually showing.
  // Without this check, the value left over from the previous round produces a
  // deadline that has already passed and the picture is skipped.
  const readyAt =
    imageReady && imageReady.eventId === currentEventId ? imageReady.at : null

  const waitingForImage = readyAt === null
  const base =
    readyAt !== null ? readyAt + AUTO_IMAGE_MS : phaseStartedAt + MAX_IMAGE_WAIT_MS

  return {
    deadline: Math.max(base, phaseStartedAt + MIN_IMAGE_VIEW_MS),
    waitingForImage,
  }
}
