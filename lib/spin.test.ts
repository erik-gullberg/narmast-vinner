/**
 * Tests for the logo flip physics.
 *
 * Run with:  npm test
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AT_REST,
  CLICK_IMPULSE,
  MAX_VELOCITY,
  RESET_DELAY_S,
  applyClick,
  isAtRest,
  step,
  type SpinState,
} from './spin.ts'

const DT = 1 / 60

function clicks(n: number): SpinState {
  let s = AT_REST
  for (let i = 0; i < n; i++) s = applyClick(s)
  return s
}

/** Step until the spin first stops moving (before any reset). */
function untilStopped(start: SpinState) {
  let s = start
  let frames = 0
  while (s.velocity > 0 && frames < 60 * 30) {
    s = step(s, DT)
    frames++
  }
  return { s, seconds: frames * DT }
}

/** Step until fully at rest again (including the wait and the reset). */
function untilAtRest(start: SpinState) {
  let s = start
  let frames = 0
  while (!isAtRest(s) && frames < 60 * 30) {
    s = step(s, DT)
    frames++
  }
  return { s, seconds: frames * DT }
}

test('one click spins and comes to a stop on its own', () => {
  const { s, seconds } = untilStopped(clicks(1))
  assert.equal(s.velocity, 0)
  assert.ok(seconds > 0.8 && seconds < 4, `stops in ${seconds.toFixed(1)}s`)
})

test('it can stop in a turned state and stays there for the reset delay', () => {
  let { s } = untilStopped(clicks(1))
  const stoppedAt = s.angle
  assert.ok(Math.abs(stoppedAt % 360) > 1, `one click happens to stop off a whole turn (${stoppedAt.toFixed(0)}°)`)

  for (let t = 0; t < RESET_DELAY_S - 0.1; t += DT) s = step(s, DT)
  assert.equal(s.angle, stoppedAt, 'holds still during the delay')
  assert.equal(s.velocity, 0)
})

test('after the delay it turns back to face forward', () => {
  const start = untilStopped(clicks(1)).s
  const { s, seconds } = untilAtRest(start)
  assert.deepEqual(s, AT_REST)
  assert.ok(seconds > RESET_DELAY_S && seconds < RESET_DELAY_S + 2, `reset took ${seconds.toFixed(1)}s`)
})

test('the reset takes the short way round', () => {
  // Stopped just past a half turn: nearest whole turn is ahead, at 360.
  let s: SpinState = { angle: 190, velocity: 0, stoppedFor: RESET_DELAY_S }
  s = step(s, DT)
  assert.equal(s.target, 360)
  // Stopped just short of a half turn: nearest is behind, at 0.
  s = step({ angle: 170, velocity: 0, stoppedFor: RESET_DELAY_S }, DT)
  assert.equal(s.target, 0)
})

test('more clicks spin it faster and longer', () => {
  assert.equal(clicks(3).velocity, 3 * CLICK_IMPULSE)
  assert.ok(untilStopped(clicks(3)).seconds > untilStopped(clicks(1)).seconds)
})

test('clicking mid-spin keeps the momentum it already has', () => {
  let s = clicks(1)
  for (let i = 0; i < 20; i++) s = step(s, DT)
  const before = s.velocity
  assert.ok(before > 0 && before < CLICK_IMPULSE, 'has slowed a bit')
  assert.equal(applyClick(s).velocity, before + CLICK_IMPULSE)
})

test('clicking while waiting or resetting cancels the reset and spins again', () => {
  const waiting = untilStopped(clicks(1)).s
  const spun = applyClick(waiting)
  assert.equal(spun.stoppedFor, undefined)
  assert.equal(spun.velocity, CLICK_IMPULSE)

  // Mid-reset the spring can be moving backwards; a click must still go forwards.
  const resetting: SpinState = { angle: 100, velocity: -200, target: 0 }
  const clicked = applyClick(resetting)
  assert.equal(clicked.target, undefined)
  assert.equal(clicked.velocity, CLICK_IMPULSE)
})

test('speed is capped', () => {
  assert.equal(clicks(50).velocity, MAX_VELOCITY)
})

test('a large frame gap (backgrounded tab) does not blow up', () => {
  let s = clicks(2)
  for (let i = 0; i < 400; i++) s = step(s, 0.05)
  assert.ok(Number.isFinite(s.angle) && Number.isFinite(s.velocity))
  assert.deepEqual(s, AT_REST)
})
