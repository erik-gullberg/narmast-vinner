/**
 * Tests for the auto-advance timing logic.
 *
 * Run with:  npm test
 *
 * Imports the real implementation (Node strips the types), so these cannot pass
 * against a stale copy of the logic.
 *
 * The first test is the regression that motivated extracting this into a pure
 * function: readiness left over from the previous round produced a deadline
 * that had already passed, so the new picture was skipped after a few hundred
 * milliseconds instead of being shown.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  planAutoAdvance,
  AUTO_IMAGE_MS,
  AUTO_REVEAL_MS,
  MIN_IMAGE_VIEW_MS,
  MAX_IMAGE_WAIT_MS,
} from './autoAdvance.ts'

const NOW = 1_000_000

test('REGRESSION: stale readiness from the previous round must not skip the picture', () => {
  // The round has just advanced: phase_started_at is now, but imageReady still
  // holds the previous round's event, whose picture loaded ~24s ago
  // (15s guessing + 9s reveal). Untagged, this produced a deadline in the past.
  const plan = planAutoAdvance({
    phase: 'showing_image',
    phaseStartedAt: NOW,
    currentEventId: 'event-B',
    imageReady: { eventId: 'event-A', at: NOW - 24_000 },
  })

  assert.ok(
    plan.deadline > NOW,
    `deadline must be in the future, got ${plan.deadline - NOW}ms relative to phase start`
  )
  assert.equal(plan.waitingForImage, true, 'should still be waiting for event-B')
})

test('readiness for the current event gives the full viewing time from that moment', () => {
  const readyAt = NOW + 3_000 // picture took 3s to load
  const plan = planAutoAdvance({
    phase: 'showing_image',
    phaseStartedAt: NOW,
    currentEventId: 'event-B',
    imageReady: { eventId: 'event-B', at: readyAt },
  })
  assert.equal(plan.deadline, readyAt + AUTO_IMAGE_MS)
  assert.equal(plan.waitingForImage, false)
})

test('a slow image does not shorten the viewing time', () => {
  const slow = planAutoAdvance({
    phase: 'showing_image', phaseStartedAt: NOW, currentEventId: 'e',
    imageReady: { eventId: 'e', at: NOW + 8_000 },
  })
  const fast = planAutoAdvance({
    phase: 'showing_image', phaseStartedAt: NOW, currentEventId: 'e',
    imageReady: { eventId: 'e', at: NOW },
  })
  assert.equal(
    slow.deadline - (NOW + 8_000),
    fast.deadline - NOW,
    'both should get the same time on screen'
  )
})

test('no readiness yet: waits, capped by MAX_IMAGE_WAIT_MS', () => {
  const plan = planAutoAdvance({
    phase: 'showing_image', phaseStartedAt: NOW, currentEventId: 'e',
    imageReady: null,
  })
  assert.equal(plan.deadline, NOW + MAX_IMAGE_WAIT_MS)
  assert.equal(plan.waitingForImage, true)
})

test('never advances before the minimum view floor', () => {
  const plan = planAutoAdvance({
    phase: 'showing_image', phaseStartedAt: NOW, currentEventId: 'e',
    imageReady: { eventId: 'e', at: NOW },
  })
  assert.ok(plan.deadline >= NOW + MIN_IMAGE_VIEW_MS)
  assert.equal(plan.deadline, NOW + AUTO_IMAGE_MS)
})

test('null currentEventId is treated as not ready', () => {
  const plan = planAutoAdvance({
    phase: 'showing_image', phaseStartedAt: NOW, currentEventId: null,
    imageReady: { eventId: 'e', at: NOW },
  })
  assert.equal(plan.waitingForImage, true)
})

test('reveal phase counts from phase_started_at and never waits', () => {
  const plan = planAutoAdvance({
    phase: 'revealing', phaseStartedAt: NOW, currentEventId: 'e',
    imageReady: null,
  })
  assert.equal(plan.deadline, NOW + AUTO_REVEAL_MS)
  assert.equal(plan.waitingForImage, false)
})
