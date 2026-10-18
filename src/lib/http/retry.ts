/** Retry rules shared by plain requests and Graph `$batch` sub-requests. */

/** Never wait longer than this between attempts, whatever Retry-After says. */
export const MAX_RETRY_WAIT_MS = 60_000

/** 429 (throttled) and 503 (service unavailable) are retried; everything else is final. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 503
}

/** Retry-After is either delta-seconds or an HTTP date. */
export function parseRetryAfter(
  value: string | null | undefined,
  now = Date.now(),
): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(value)
  return Number.isNaN(date) ? undefined : Math.max(0, date - now)
}

/** How long to wait before the next attempt: Retry-After if given, else exponential backoff, capped. */
export function retryDelayMs(retryAfter: string | null | undefined, attempt: number): number {
  const wait = parseRetryAfter(retryAfter) ?? 1000 * 2 ** attempt
  return Math.min(wait, MAX_RETRY_WAIT_MS)
}

/**
 * Retries left for one logical request. A `$batch` chunk shares one budget between retries of the
 * whole POST and retries of its sub-requests, so they don't multiply.
 */
export interface RetryBudget {
  left: number
}

export function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason as Error)
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason as Error)
      },
      { once: true },
    )
  })
}
