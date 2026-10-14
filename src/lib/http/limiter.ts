export interface Limiter {
  run<T>(task: () => Promise<T>): Promise<T>
  readonly active: number
  readonly queued: number
}

/** Runs at most `max` tasks at a time; the rest wait in FIFO order. */
export function createLimiter(max: number): Limiter {
  let active = 0
  const queue: (() => void)[] = []

  const next = () => {
    active--
    queue.shift()?.()
  }

  return {
    get active() {
      return active
    },
    get queued() {
      return queue.length
    },
    async run<T>(task: () => Promise<T>): Promise<T> {
      if (active >= max) {
        await new Promise<void>((resolve) => queue.push(resolve))
      }
      active++
      try {
        return await task()
      } finally {
        next()
      }
    },
  }
}
