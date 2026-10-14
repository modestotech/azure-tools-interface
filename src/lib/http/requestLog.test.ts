import { createRequestLogStore, exportableEntries } from './requestLog'

const request = {
  api: 'arm',
  method: 'GET',
  url: '/subscriptions/{sub}/x',
  rawUrl: '/subscriptions/00000000-0000-0000-0000-0000000000bb/x',
} as const

describe('request log store', () => {
  it('tracks an entry from pending to done, with duration and counters', () => {
    let t = 100
    const store = createRequestLogStore({ now: () => t })
    const log = store.getState()
    const id = log.start(request)
    expect(store.getState().entries[0]).toMatchObject({ id, state: 'pending', retries: 0 })
    expect(store.getState().counters.inFlight).toBe(1)

    log.retry(id, 429)
    t = 243
    log.finish(id, { state: 'ok', status: 200, bytes: 4200 })

    expect(store.getState().entries[0]).toMatchObject({
      state: 'ok',
      status: 200,
      bytes: 4200,
      retries: 1,
      durationMs: 143,
    })
    expect(store.getState().counters).toEqual({ inFlight: 0, done: 1, errors: 0, retries: 1 })
  })

  it('counts errors', () => {
    const store = createRequestLogStore()
    const id = store.getState().start(request)
    store.getState().finish(id, { state: 'error', status: 404, error: 'Not found' })
    expect(store.getState().counters.errors).toBe(1)
  })

  it('keeps only the newest entries once capacity is reached, but keeps counting', () => {
    const store = createRequestLogStore({ capacity: 3 })
    for (let i = 0; i < 5; i++) {
      const id = store.getState().start(request)
      store.getState().finish(id, { state: 'ok' })
    }
    expect(store.getState().entries.map((e) => e.id)).toEqual([3, 4, 5])
    expect(store.getState().counters.done).toBe(5)
  })

  it('exports masked URLs only', () => {
    const store = createRequestLogStore()
    store.getState().start(request)
    const exported = JSON.stringify(exportableEntries(store.getState().entries))
    expect(exported).toContain('{sub}')
    expect(exported).not.toContain('0000000000bb')
  })

  it('clears entries and counters', () => {
    const store = createRequestLogStore()
    store.getState().start(request)
    store.getState().clear()
    expect(store.getState().entries).toEqual([])
    expect(store.getState().counters.inFlight).toBe(0)
  })
})
