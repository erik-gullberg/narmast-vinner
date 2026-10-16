/**
 * Tests for the latest-only pin sender.
 *
 * Run with:  npm test
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createLatestOnlySender, type PinSyncStatus } from './pinSync.ts'

/** A send() whose calls stay pending until the test resolves them. */
function controllableSend() {
  const calls: { value: number; resolve: () => void; reject: () => void }[] = []
  const send = (value: number) =>
    new Promise<void>((resolve, reject) => {
      calls.push({ value, resolve, reject: () => reject(new Error('fail')) })
    })
  return { send, calls }
}

const flush = () => new Promise((r) => setImmediate(r))

test('rapid clicks while a request is in flight collapse to the newest one', async () => {
  const { send, calls } = controllableSend()
  const statuses: PinSyncStatus[] = []
  const sender = createLatestOnlySender(send, (s) => statuses.push(s))

  sender.push(1)
  sender.push(2)
  sender.push(3)
  assert.deepEqual(calls.map((c) => c.value), [1], 'only one request in flight')

  calls[0].resolve()
  await flush()
  assert.deepEqual(calls.map((c) => c.value), [1, 3], 'skips 2, sends the newest')

  calls[1].resolve()
  await flush()
  assert.equal(statuses.at(-1), 'saved')
})

test('does not report saved for a value that has already been superseded', async () => {
  const { send, calls } = controllableSend()
  const statuses: PinSyncStatus[] = []
  const sender = createLatestOnlySender(send, (s) => statuses.push(s))

  sender.push(1)
  sender.push(2)
  calls[0].resolve()
  await flush()
  assert.deepEqual(statuses, ['saving', 'saving'])
})

test('a failed send reports error, and the next click retries', async () => {
  const { send, calls } = controllableSend()
  const statuses: PinSyncStatus[] = []
  const sender = createLatestOnlySender(send, (s) => statuses.push(s))

  sender.push(1)
  calls[0].reject()
  await flush()
  assert.equal(statuses.at(-1), 'error')

  sender.push(2)
  calls[1].resolve()
  await flush()
  assert.equal(statuses.at(-1), 'saved')
})

test('stop() drops queued values and silences late results', async () => {
  const { send, calls } = controllableSend()
  const statuses: PinSyncStatus[] = []
  const sender = createLatestOnlySender(send, (s) => statuses.push(s))

  sender.push(1)
  sender.push(2)
  sender.stop()
  calls[0].resolve()
  await flush()
  sender.push(3)
  await flush()

  assert.equal(calls.length, 1, 'nothing sent after stop')
  assert.deepEqual(statuses, ['saving'], 'no status after stop')
})
