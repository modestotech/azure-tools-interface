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
  // as free while a queued task is about to take it.
  const release = () => {
    const wake = queue.shift()
    if (wake) wake()
    else active--
  }

  const waitForSlot = (signal: AbortSignal | undefined) =>
    new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        queue.splice(queue.indexOf(wake), 1)
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
