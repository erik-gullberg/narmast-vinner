/**
 * Physics for the clickable logo flip (rotation around the vertical axis).
 *
 * Each click adds angular velocity, so repeated clicks spin it faster.
 * Friction slows it to a stop wherever it happens to be, so it can come to
 * rest half-turned or mirrored. After RESET_DELAY_S of sitting still, a
 * spring turns it back to the nearest whole turn, facing forward again.
 *
 * Angles are in degrees, velocities in degrees per second, dt in seconds.
 */

export interface SpinState {
  angle: number
  velocity: number
  /** Seconds spent stopped at a non-whole-turn angle, waiting to reset. */
  stoppedFor?: number
  /** Whole turn the reset spring is heading for; fixed once the reset starts. */
  target?: number
}

/** Speed added by one click: about two flips per second. */
export const CLICK_IMPULSE = 720
/** Upper bound so frantic clicking stays a blur rather than strobing. */
export const MAX_VELOCITY = 4320
/** Drag proportional to speed, per second: shapes the long coast at high speed. */
export const FRICTION = 0.7
/** Constant drag, deg/s²: makes it actually stop instead of creeping forever. */
export const CONSTANT_DRAG = 150
/** How long it sits still in a turned state before resetting. */
export const RESET_DELAY_S = 0.5

const SPRING_STIFFNESS = 60
const SPRING_DAMPING = 2 * Math.sqrt(SPRING_STIFFNESS) * 0.7 // slight wobble
const REST_EPSILON_DEG = 0.5
const REST_EPSILON_VEL = 5

export const AT_REST: SpinState = { angle: 0, velocity: 0 }

export function isAtRest(s: SpinState): boolean {
  return s.angle === 0 && s.velocity === 0 && s.target === undefined
}

/** A click adds speed, and cancels any pending wait or reset in progress. */
export function applyClick(s: SpinState): SpinState {
  return {
    angle: s.angle,
    velocity: Math.min(MAX_VELOCITY, Math.max(0, s.velocity) + CLICK_IMPULSE),
  }
}

/** Distance from the nearest whole turn, in degrees (0..180). */
function offWholeTurn(angle: number): number {
  return Math.abs(angle - Math.round(angle / 360) * 360)
}

export function step(s: SpinState, dt: number): SpinState {
  if (isAtRest(s) || dt <= 0) return s

  // Resetting: spring to the nearest whole turn, then normalise to 0.
  if (s.target !== undefined) {
    const accel = SPRING_STIFFNESS * (s.target - s.angle) - SPRING_DAMPING * s.velocity
    const velocity = s.velocity + accel * dt
    const angle = s.angle + velocity * dt
    if (Math.abs(s.target - angle) < REST_EPSILON_DEG && Math.abs(velocity) < REST_EPSILON_VEL) {
      return AT_REST // whole turns are equivalent; reset so angles never grow
    }
    return { angle, velocity, target: s.target }
  }

  // Coasting.
  if (s.velocity > 0) {
    const velocity = Math.max(0, s.velocity - (FRICTION * s.velocity + CONSTANT_DRAG) * dt)
    const angle = s.angle + velocity * dt
    if (velocity > 0) return { angle, velocity }
    // Just stopped. Landing on a whole turn by chance needs no reset.
    return offWholeTurn(angle) < REST_EPSILON_DEG ? AT_REST : { angle, velocity: 0, stoppedFor: 0 }
  }

  // Stopped in a turned state: wait, then start the reset.
  const stoppedFor = (s.stoppedFor ?? 0) + dt
  if (stoppedFor < RESET_DELAY_S) return { angle: s.angle, velocity: 0, stoppedFor }
  return { angle: s.angle, velocity: 0, target: Math.round(s.angle / 360) * 360 }
}
