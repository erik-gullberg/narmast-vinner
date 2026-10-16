/**
 * Sends pin placements to the server one at a time, latest value wins.
 *
 * Every map click calls place_pin(). Firing those concurrently would let an
 * earlier click's request land after a later one, and the server would keep
 * the wrong pin. Instead at most one request is in flight; clicks made while
 * it runs collapse into a single follow-up carrying only the newest position.
 */

export type PinSyncStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface LatestOnlySender<T> {
  push(value: T): void
  /** Drop anything queued and ignore results still in flight. */
  stop(): void
}

export function createLatestOnlySender<T>(
  send: (value: T) => Promise<void>,
  onStatus: (status: PinSyncStatus) => void
): LatestOnlySender<T> {
  let inFlight = false
  let stopped = false
  let pending: { value: T } | null = null

  const pump = async () => {
    inFlight = true
    while (pending && !stopped) {
      const { value } = pending
      pending = null
      onStatus('saving')
      let ok = true
      try {
        await send(value)
      } catch {
        ok = false
      }
      // A newer value is already queued: its result is the one that matters.
      if (!pending && !stopped) onStatus(ok ? 'saved' : 'error')
    }
    inFlight = false
  }

  return {
    push(value) {
      if (stopped) return
      pending = { value }
      if (!inFlight) void pump()
    },
    stop() {
      stopped = true
      pending = null
    },
  }
}
