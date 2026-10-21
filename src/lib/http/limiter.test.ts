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

  it('drops a queued task when its signal aborts, without starting it', async () => {
    const limiter = createLimiter(1)
    let finishFirst = () => {}
    const first = limiter.run(() => new Promise<void>((resolve) => (finishFirst = resolve)))
    const controller = new AbortController()
    const started = vi.fn(() => Promise.resolve())
    const queued = limiter.run(started, controller.signal)
    expect(limiter.queued).toBe(1)

    controller.abort()
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' })
    expect(limiter.queued).toBe(0)

    finishFirst()
    await first
    expect(started).not.toHaveBeenCalled()
    expect(limiter.active).toBe(0)
  })

  it('refuses to start a task whose signal has already aborted', async () => {
    const limiter = createLimiter(1)
    const task = vi.fn(() => Promise.resolve())
    await expect(limiter.run(task, AbortSignal.abort())).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(task).not.toHaveBeenCalled()
    expect(limiter.active).toBe(0)
  })

  it('frees the slot when a task fails', async () => {
    const limiter = createLimiter(1)
    await expect(limiter.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    await expect(limiter.run(() => Promise.resolve('ok'))).resolves.toBe('ok')
  })
})
