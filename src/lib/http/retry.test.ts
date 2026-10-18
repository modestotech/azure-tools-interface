import { isRetryableStatus, MAX_RETRY_WAIT_MS, parseRetryAfter, retryDelayMs } from './retry'

describe('retry rules', () => {
  it('retries 429 and 503 only', () => {
    expect([429, 503].every(isRetryableStatus)).toBe(true)
    expect([400, 401, 403, 404, 500, 502].some(isRetryableStatus)).toBe(false)
  })

  it('reads Retry-After as seconds or an HTTP date', () => {
    expect(parseRetryAfter('5')).toBe(5000)
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000)
    expect(parseRetryAfter(null)).toBeUndefined()
    expect(parseRetryAfter('soon')).toBeUndefined()
  })

  it('falls back to exponential backoff and caps the wait', () => {
    expect([0, 1, 2].map((attempt) => retryDelayMs(undefined, attempt))).toEqual([1000, 2000, 4000])
    expect(retryDelayMs('2', 5)).toBe(2000)
    expect(retryDelayMs('3600', 0)).toBe(MAX_RETRY_WAIT_MS)
    expect(retryDelayMs(undefined, 20)).toBe(MAX_RETRY_WAIT_MS)
  })
})
