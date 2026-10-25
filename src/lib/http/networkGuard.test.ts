import { API_RESOURCES } from '@/lib/token/resources'
import { installNetworkGuard, isReadOnlyRequest, ReadOnlyViolation } from './networkGuard'

const ARM_URL = `${API_RESOURCES.arm.baseUrl}/subscriptions`
const BATCH_URL = `${API_RESOURCES.graph.baseUrl}/$batch`

const batch = (requests: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ requests, ...extra })
const get = (url = '/groups/a') => ({ id: '1', method: 'GET', url })

describe('isReadOnlyRequest', () => {
  it('allows a GET without a body, in any case', () => {
    expect(isReadOnlyRequest('GET', ARM_URL, undefined)).toBe(true)
    expect(isReadOnlyRequest('get', ARM_URL, null)).toBe(true)
  })

  it.each(['PUT', 'PATCH', 'DELETE', 'POST', 'HEAD', 'OPTIONS', 'put', 'delete', 'Patch'])(
    'refuses %s',
    (method) => {
      expect(isReadOnlyRequest(method, ARM_URL, undefined)).toBe(false)
    },
  )

  it('refuses a GET with a body', () => {
    expect(isReadOnlyRequest('GET', ARM_URL, '{}')).toBe(false)
  })

  it('allows a Graph $batch of GETs', () => {
    expect(isReadOnlyRequest('POST', BATCH_URL, batch([get(), get('/groups/b')]))).toBe(true)
  })

  it.each([
    ['a DELETE sub-request', batch([{ id: '1', method: 'DELETE', url: '/groups/a' }])],
    ['a lowercase get sub-request', batch([{ id: '1', method: 'get', url: '/groups/a' }])],
    ['a sub-request with a body', batch([{ ...get(), body: {} }])],
    ['a sub-request with headers', batch([{ ...get(), headers: {} }])],
    ['an absolute sub-request URL', batch([get('https://graph.microsoft.com/v1.0/x')])],
    ['a protocol-relative sub-request URL', batch([get('//evil.example.net/x')])],
    ['an extra top-level field', batch([get()], { other: 1 })],
    ['no sub-requests', batch([])],
    ['requests that are not a list', batch({ 0: get() })],
    ['a body that is not JSON', 'requests'],
    ['a body that is not a string', { requests: [get()] }],
  ])('refuses a $batch with %s', (_name, body) => {
    expect(isReadOnlyRequest('POST', BATCH_URL, body)).toBe(false)
  })

  it('refuses a $batch POST anywhere but the Graph $batch URL', () => {
    const body = batch([get()])
    expect(isReadOnlyRequest('POST', `${API_RESOURCES.graph.baseUrl}/groups`, body)).toBe(false)
    expect(isReadOnlyRequest('POST', `${API_RESOURCES.arm.baseUrl}/$batch`, body)).toBe(false)
    expect(isReadOnlyRequest('POST', `${BATCH_URL}?x=1`, body)).toBe(false)
  })
})

/** A stand-in for the browser's network APIs, recording what reaches them. */
function fakeTarget() {
  const sent: string[] = []
  class FakeXhr {
    open(method: string, url: string) {
      sent.push(`xhr open ${method} ${url}`)
    }
    send(body?: unknown) {
      sent.push(`xhr send ${String(body)}`)
    }
  }
  const target = {
    fetch: vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(`fetch ${init?.method ?? (input instanceof Request ? input.method : 'GET')}`)
      return Promise.resolve(new Response('{}'))
    }),
    XMLHttpRequest: FakeXhr as unknown as typeof XMLHttpRequest,
    navigator: { sendBeacon: vi.fn<(url: string | URL) => boolean>(() => true) },
  }
  return { target, sent }
}

describe('installNetworkGuard', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lets reads through to fetch', async () => {
    const { target, sent } = fakeTarget()
    installNetworkGuard(target)
    await target.fetch(ARM_URL)
    await target.fetch(BATCH_URL, { method: 'POST', body: batch([get()]) })
    expect(sent).toEqual(['fetch GET', 'fetch POST'])
  })

  it.each(['PUT', 'PATCH', 'DELETE', 'POST', 'put'])(
    'refuses a %s through fetch before it is sent',
    async (method) => {
      const { target, sent } = fakeTarget()
      installNetworkGuard(target)
      await expect(target.fetch(ARM_URL, { method })).rejects.toBeInstanceOf(ReadOnlyViolation)
      expect(sent).toEqual([])
    },
  )

  it('refuses a write given as a Request object', async () => {
    const { target, sent } = fakeTarget()
    installNetworkGuard(target)
    await expect(target.fetch(new Request(ARM_URL, { method: 'DELETE' }))).rejects.toThrow(
      /Blocked a DELETE request to https:\/\/management\.azure\.com/,
    )
    await expect(
      target.fetch(new Request(BATCH_URL, { method: 'POST', body: batch([get()]) })),
    ).rejects.toBeInstanceOf(ReadOnlyViolation)
    expect(sent).toEqual([])
  })

  it('names only the origin, never the path with its IDs', async () => {
    const { target } = fakeTarget()
    installNetworkGuard(target)
    await expect(
      target.fetch(`${ARM_URL}/00000000-0000-0000-0000-000000000001`, { method: 'PUT' }),
    ).rejects.toThrow(
      'Blocked a PUT request to https://management.azure.com: this app only sends reads.',
    )
  })

  it('refuses XMLHttpRequest writes and bodies, and lets GETs through', () => {
    const { target, sent } = fakeTarget()
    installNetworkGuard(target)
    const write = new target.XMLHttpRequest()
    expect(() => {
      write.open('PATCH', ARM_URL)
    }).toThrow(ReadOnlyViolation)
    const read = new target.XMLHttpRequest()
    read.open('GET', ARM_URL)
    expect(() => {
      read.send('{}')
    }).toThrow(ReadOnlyViolation)
    read.send()
    expect(sent).toEqual([`xhr open GET ${ARM_URL}`, 'xhr send undefined'])
  })

  it('refuses every beacon', () => {
    const { target } = fakeTarget()
    const original = target.navigator.sendBeacon
    installNetworkGuard(target)
    expect(target.navigator.sendBeacon(ARM_URL)).toBe(false)
    expect(original).not.toHaveBeenCalled()
  })

  it('wraps once when installed twice, and again when fetch was replaced', async () => {
    const { target, sent } = fakeTarget()
    installNetworkGuard(target)
    installNetworkGuard(target)
    await target.fetch(ARM_URL)
    expect(sent).toEqual(['fetch GET'])

    target.fetch = vi.fn(() => Promise.resolve(new Response('{}')))
    installNetworkGuard(target)
    await expect(target.fetch(ARM_URL, { method: 'DELETE' })).rejects.toBeInstanceOf(
      ReadOnlyViolation,
    )
  })
})
