import { delay, http, HttpResponse } from 'msw'
import { APIM_API_VERSION } from '@/services/arm/apiVersion'
import { ARM, GRAPH } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { armToken, graphToken, TEST_SUB, TEST_TENANT } from '@/test/helpers/fakeJwt'
import { createHttpClient, parseRetryAfter, type HttpClientConfig } from './client'
import { HttpError, UnauthorizedError } from './errors'
import { GRAPH_BATCH_URL } from './readOnly'
import { createRequestLogStore } from './requestLog'

const SVC_URL = `${ARM}/subscriptions/${TEST_SUB}/providers/Microsoft.ApiManagement/service?api-version=${APIM_API_VERSION}`

function setup(overrides: Partial<HttpClientConfig> = {}) {
  const tokens = { arm: armToken(), graph: graphToken() }
  const log = createRequestLogStore()
  const sleeps: number[] = []
  const client = createHttpClient({
    getToken: (api) => tokens[api],
    getMaskValues: () => ({ subscriptionId: TEST_SUB, tenantId: TEST_TENANT }),
    logger: log.getState(),
    sleep: (ms) => {
      sleeps.push(ms)
      return Promise.resolve()
    },
    ...overrides,
  })
  return { client, log, tokens, sleeps }
}

async function caught(promise: Promise<unknown>): Promise<HttpError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof HttpError) return error
    throw error
  }
  throw new Error('expected an HttpError')
}

describe('createHttpClient', () => {
  it('sends the bearer token and logs the request with a masked URL', async () => {
    let auth: string | null = null
    server.use(
      http.get(
        `${ARM}/subscriptions/:sub/providers/Microsoft.ApiManagement/service`,
        ({ request }) => {
          auth = request.headers.get('Authorization')
          return HttpResponse.json({ value: [{ name: 'apim-1' }] })
        },
      ),
    )
    const { client, log, tokens } = setup()

    await expect(client.getJson('arm', SVC_URL, { queryKey: ['arm', TEST_SUB] })).resolves.toEqual({
      value: [{ name: 'apim-1' }],
    })

    expect(auth).toBe(`Bearer ${tokens.arm}`)
    const [entry] = log.getState().entries
    expect(entry).toMatchObject({
      api: 'arm',
      method: 'GET',
      state: 'ok',
      status: 200,
      url: `${ARM}/subscriptions/{sub}/providers/Microsoft.ApiManagement/service?api-version=2024-05-01`,
      queryKey: '["arm","{sub}"]',
    })
    expect(entry?.bytes).toBeGreaterThan(0)
    expect(JSON.stringify(log.getState().entries)).not.toContain(tokens.arm)
  })

  it('follows ARM nextLink and Graph @odata.nextLink', async () => {
    server.use(
      http.get(`${ARM}/list`, ({ request }) =>
        new URL(request.url).searchParams.get('page') === '2'
          ? HttpResponse.json({ value: [3] })
          : HttpResponse.json({ value: [1, 2], nextLink: `${ARM}/list?page=2` }),
      ),
      http.get(`${GRAPH}/groups/g/members`, ({ request }) =>
        new URL(request.url).searchParams.has('$skiptoken')
          ? HttpResponse.json({ value: ['b'] })
          : HttpResponse.json({
              value: ['a'],
              '@odata.nextLink': `${GRAPH}/groups/g/members?$skiptoken=x`,
            }),
      ),
    )
    const { client, log } = setup()
    await expect(client.getAllPages('arm', `${ARM}/list`)).resolves.toEqual([1, 2, 3])
    await expect(client.getAllPages('graph', `${GRAPH}/groups/g/members`)).resolves.toEqual([
      'a',
      'b',
    ])
    expect(log.getState().entries).toHaveLength(4)
  })

  it('refuses a nextLink pointing to another host', async () => {
    server.use(
      http.get(`${ARM}/list`, () =>
        HttpResponse.json({ value: [], nextLink: 'https://evil.example.net/steal' }),
      ),
    )
    const error = await caught(setup().client.getAllPages('arm', `${ARM}/list`))
    expect(error.kind).toBe('disallowed-host')
  })

  it('refuses URLs outside the API origin before sending anything', async () => {
    const { client, log } = setup()
    expect((await caught(client.getJson('arm', 'https://graph.microsoft.com/v1.0/me'))).kind).toBe(
      'disallowed-host',
    )
    expect((await caught(client.getJson('arm', '/relative/path'))).kind).toBe('disallowed-host')
    expect(log.getState().entries).toHaveLength(0)
  })

  it('refuses a token for the wrong API, or no token, before sending anything', async () => {
    const swapped = setup({ getToken: () => graphToken() })
    expect((await caught(swapped.client.getJson('arm', SVC_URL))).kind).toBe('audience-mismatch')
    const none = setup({ getToken: () => undefined })
    expect((await caught(none.client.getJson('arm', SVC_URL))).kind).toBe('no-token')
    expect(swapped.log.getState().entries).toHaveLength(0)
  })

  it('honours Retry-After on 429 and then succeeds', async () => {
    let calls = 0
    server.use(
      http.get(`${ARM}/throttled`, () =>
        ++calls < 3
          ? new HttpResponse(null, { status: 429, headers: { 'Retry-After': '2' } })
          : HttpResponse.json({ ok: true }),
      ),
    )
    const { client, log, sleeps } = setup()
    await expect(client.getJson('arm', `${ARM}/throttled`)).resolves.toEqual({ ok: true })
    expect(sleeps).toEqual([2000, 2000])
    expect(log.getState().entries[0]).toMatchObject({ state: 'ok', retries: 2 })
    expect(log.getState().counters.retries).toBe(2)
  })

  it('gives up after maxRetries with a throttled error', async () => {
    server.use(http.get(`${ARM}/throttled`, () => new HttpResponse(null, { status: 429 })))
    const { client, sleeps } = setup({ maxRetries: 2 })
    const error = await caught(client.getJson('arm', `${ARM}/throttled`))
    expect(error).toMatchObject({ kind: 'throttled', status: 429 })
    expect(sleeps).toEqual([1000, 2000])
  })

  it('turns 401 into UnauthorizedError with the az command, without leaking the token or IDs', async () => {
    const { client, tokens } = setup()
    server.use(
      http.get(`${ARM}/subscriptions/:sub/providers/Microsoft.ApiManagement/service`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'ExpiredAuthenticationToken',
              message: `Token ${tokens.arm} for tenant ${TEST_TENANT} expired.`,
            },
          },
          { status: 401 },
        ),
      ),
    )
    const error = await caught(client.getJson('arm', SVC_URL))
    expect(error).toBeInstanceOf(UnauthorizedError)
    const unauthorized = error as UnauthorizedError
    expect(unauthorized.azCommand).toBe(
      `az account get-access-token --resource https://management.azure.com --tenant ${TEST_TENANT} --query accessToken -o tsv`,
    )
    expect(unauthorized.message).toContain('re-run the az command')
    expect(unauthorized.message).toContain('ExpiredAuthenticationToken')
    for (const text of [unauthorized.message, unauthorized.url ?? '']) {
      expect(text).not.toContain(tokens.arm)
      expect(text).not.toContain(TEST_TENANT)
      expect(text).not.toContain(TEST_SUB)
    }
  })

  it.each([
    [403, 'forbidden'],
    [404, 'not-found'],
    [500, 'http'],
  ] as const)('maps %i to kind %s and logs it as an error', async (status, kind) => {
    server.use(
      http.get(`${ARM}/x`, () =>
        HttpResponse.json({ error: { code: 'Code', message: 'msg' } }, { status }),
      ),
    )
    const { client, log } = setup()
    expect(await caught(client.getJson('arm', `${ARM}/x`))).toMatchObject({ kind, status })
    expect(log.getState().entries[0]).toMatchObject({
      state: 'error',
      status,
      error: expect.stringContaining('Code: msg') as unknown,
    })
  })

  it('reports network failures (including CORS blocks) as kind network', async () => {
    server.use(http.get(`${ARM}/x`, () => HttpResponse.error()))
    const error = await caught(setup().client.getJson('arm', `${ARM}/x`))
    expect(error.kind).toBe('network')
    expect(error.message).toContain('CORS')
  })

  it('logs aborted requests as cancelled and rethrows the AbortError', async () => {
    server.use(
      http.get(`${ARM}/slow`, async () => {
        await delay(200)
        return HttpResponse.json({})
      }),
    )
    const { client, log } = setup()
    const controller = new AbortController()
    const promise = client.getJson('arm', `${ARM}/slow`, { signal: controller.signal })
    controller.abort()
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(log.getState().entries[0]?.state).toBe('cancelled')
  })

  it('keeps at most 8 requests in flight', async () => {
    let inFlight = 0
    let peak = 0
    server.use(
      http.get(`${ARM}/item/:n`, async () => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await delay(10)
        inFlight--
        return HttpResponse.json({})
      }),
    )
    const { client } = setup()
    await Promise.all(
      Array.from({ length: 20 }, (_, n) => client.getJson('arm', `${ARM}/item/${String(n)}`)),
    )
    expect(peak).toBe(8)
  })
})

describe('batch', () => {
  it('chunks by 20, sends only GETs, retries 429 sub-responses and keeps order', async () => {
    const posted: { method: string; url: string }[][] = []
    const throttledOnce = new Set(['r3'])
    server.use(
      http.post(GRAPH_BATCH_URL, async ({ request }) => {
        const body = (await request.json()) as {
          requests: { id: string; method: string; url: string }[]
        }
        posted.push(body.requests)
        return HttpResponse.json({
          responses: body.requests.map((r) => {
            if (throttledOnce.delete(r.id)) {
              return { id: r.id, status: 429, headers: { 'Retry-After': '1' } }
            }
            return { id: r.id, status: 200, body: { url: r.url } }
          }),
        })
      }),
    )
    const { client, log, sleeps } = setup()
    const requests = Array.from({ length: 45 }, (_, i) => ({
      id: `r${String(i)}`,
      url: `/groups/${String(i)}`,
    }))

    const responses = await client.batch(requests)

    expect(responses.map((r) => r.id)).toEqual(requests.map((r) => r.id))
    expect(responses.every((r) => r.status === 200)).toBe(true)
    // 3 chunks (20 + 20 + 5), plus one retry for r3
    expect(posted.map((p) => p.length).sort((a, b) => a - b)).toEqual([1, 5, 20, 20])
    expect(posted.flat().every((r) => r.method === 'GET')).toBe(true)
    expect(sleeps).toEqual([1000])
    expect(log.getState().entries.map((e) => e.label)).toContain('$batch ×20')
  })
})

describe('parseRetryAfter', () => {
  it('reads seconds and HTTP dates', () => {
    expect(parseRetryAfter('5')).toBe(5000)
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000)
    expect(parseRetryAfter(null)).toBeUndefined()
    expect(parseRetryAfter('soon')).toBeUndefined()
  })
})
