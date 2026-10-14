import { createLimiter } from './limiter'

describe('createLimiter', () => {
  it('never runs more than max tasks at once, and runs them all', async () => {
    const limiter = createLimiter(3)
    let running = 0
    let peak = 0
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        limiter.run(async () => {
          running++
          peak = Math.max(peak, running)
          await new Promise((r) => setTimeout(r, 5))
          running--
          return i
        }),
      ),
    )
    expect(peak).toBe(3)
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(limiter.active).toBe(0)
  })

  it('frees the slot when a task fails', async () => {
    const limiter = createLimiter(1)
    await expect(limiter.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    await expect(limiter.run(() => Promise.resolve('ok'))).resolves.toBe('ok')
  })
})
