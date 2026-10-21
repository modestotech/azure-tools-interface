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
    expect(store.getState().counters).toEqual({ inFlight: 0, finished: 1, errors: 0, retries: 1 })
  })

  it('keeps the start label unless finish replaces it', () => {
    const store = createRequestLogStore()
    const log = store.getState()
    const kept = log.start({ ...request, label: '$batch ×3' })
    const replaced = log.start({ ...request, label: '$batch ×3' })
    log.finish(kept, { state: 'ok' })
    log.finish(replaced, { state: 'ok', label: '$batch ×3 · 1 failed' })
    expect(store.getState().entries.map((e) => e.label)).toEqual([
      '$batch ×3',
      '$batch ×3 · 1 failed',
    ])
  })

  it('counts errors', () => {
    const store = createRequestLogStore()
    const id = store.getState().start(request)
    store.getState().finish(id, { state: 'error', status: 404, error: 'Not found' })
    expect(store.getState().counters.errors).toBe(1)
  })

  it('counts an expected 404 (empty) as done but not as an error', () => {
    const store = createRequestLogStore()
    const id = store.getState().start(request)
    store.getState().finish(id, { state: 'empty', status: 404 })
    expect(store.getState().entries[0]).toMatchObject({ state: 'empty', status: 404 })
    expect(store.getState().counters).toMatchObject({ finished: 1, errors: 0 })
  })

  it('keeps only the newest entries once capacity is reached, but keeps counting', () => {
    const store = createRequestLogStore({ capacity: 3 })
    for (let i = 0; i < 5; i++) {
      const id = store.getState().start(request)
      store.getState().finish(id, { state: 'ok' })
    }
    expect(store.getState().entries.map((e) => e.id)).toEqual([3, 4, 5])
    expect(store.getState().counters.finished).toBe(5)
  })

  it('exports masked URLs only, through an allowlist of fields', () => {
    const store = createRequestLogStore()
    store.getState().start(request)
    const [entry] = store.getState().entries
    if (!entry) throw new Error('no entry')
    const exported = exportableEntries([{ ...entry, secretField: 'leak' } as typeof entry])
    const json = JSON.stringify(exported)
    expect(json).toContain('{sub}')
    expect(json).not.toContain('0000000000bb')
    expect(json).not.toContain('leak')
    expect(exported[0]).toMatchObject({ id: entry.id, url: entry.url, state: 'pending' })
  })

  it('finishes the right entry when older ones were dropped by the cap', () => {
    const store = createRequestLogStore({ capacity: 2 })
    const first = store.getState().start(request)
    const second = store.getState().start(request)
    const third = store.getState().start(request)
    store.getState().finish(third, { state: 'ok', status: 200 })
    store.getState().finish(first, { state: 'error', status: 500 })
    expect(store.getState().entries.map((e) => [e.id, e.state])).toEqual([
      [second, 'pending'],
      [third, 'ok'],
    ])
    // The dropped entry still counts: it was a real request.
    expect(store.getState().counters).toMatchObject({ inFlight: 1, finished: 2, errors: 1 })
  })

  it('ignores requests that were in flight when the log was cleared', () => {
    const store = createRequestLogStore()
    const id = store.getState().start(request)
    store.getState().clear()
    store.getState().retry(id, 429)
    store.getState().finish(id, { state: 'error', status: 500 })
    expect(store.getState().entries).toEqual([])
    expect(store.getState().counters).toEqual({ inFlight: 0, finished: 0, errors: 0, retries: 0 })
  })

  it('clears entries and counters', () => {
    const store = createRequestLogStore()
    store.getState().start(request)
    store.getState().clear()
    expect(store.getState().entries).toEqual([])
    expect(store.getState().counters.inFlight).toBe(0)
  })
})
