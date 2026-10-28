export interface Limiter {
  /**
   * Runs `task` once a slot is free. If `signal` aborts while the task is still queued, it leaves
   * the queue and the promise rejects with the signal's reason; the task never starts.
   */
  run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T>
  readonly active: number
  readonly queued: number
}

/** Runs at most `max` tasks at a time; the rest wait in FIFO order. */
export function createLimiter(max: number): Limiter {
  let active = 0
  const queue: (() => void)[] = []

  // A finished task hands its slot straight to the next queued one, so `active` never counts a slot
  // as free while a queued task is about to take it. Handing over leaves `active` unchanged: the
  // slot passes from the finished task to the woken one. Only when nobody waits does it go free.
  const release = () => {
    const wake = queue.shift()
    if (wake) wake()
    else active--
  }

  /**
   * Queues the caller until `release()` hands it a slot. Each waiter is its `wake` function in
   * `queue`, and leaves the queue exactly once, by one of two paths:
   * - `release()` shifts it out and calls it; `wake` removes the abort listener before resolving,
   *   so `onAbort` can't run for a waiter that already holds a slot.
   * - the signal aborts while it's still queued; `onAbort` takes it out and rejects. It never got a
   *   slot, so `active` is untouched.
   * Both run synchronously, so a waiter is either in the queue or has left it by one path, never both.
   */
  const waitForSlot = (signal: AbortSignal | undefined) =>
    new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        const at = queue.indexOf(wake)
        // Always found (see above). If that ever broke, splice(-1, 1) would drop another waiter.
        if (at !== -1) queue.splice(at, 1)
        reject(signal?.reason as Error)
      }
      const wake = () => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }
      queue.push(wake)
      signal?.addEventListener('abort', onAbort, { once: true })
    })

  return {
    get active() {
      return active
    },
    get queued() {
      return queue.length
    },
    async run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
      signal?.throwIfAborted()
      if (active < max) active++
      else await waitForSlot(signal)
      try {
        return await task()
      } finally {
        release()
      }
    },
  }
}
