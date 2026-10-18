import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { armToken, graphToken, TEST_SUB, TEST_TENANT } from '@/test/helpers/fakeJwt'
import { requestLogStore } from '@/lib/http'
import { clearSession, onClearSession } from './clearSession'
import { httpClient } from './httpClient'
import { sessionStore } from './sessionStore'

describe('session store', () => {
  afterEach(() => {
    clearSession()
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

    server.use(http.get('https://management.azure.com/x', () => HttpResponse.json({})))
    await httpClient.getJson('arm', `https://management.azure.com/x?sub=${TEST_SUB}`)

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
    await expect(
      httpClient.getJson('arm', 'https://management.azure.com/unmocked-guard'),
    ).rejects.toMatchObject({ kind: 'network', status: undefined })
  })

  it('normalizes pasted tokens', () => {
    const token = armToken()
    sessionStore.getState().setToken('arm', `  Bearer ${token}\n`)
    expect(sessionStore.getState().tokens.arm).toBe(token)
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
    server.use(http.get('https://management.azure.com/x', () => HttpResponse.json({})))
    await httpClient.getJson('arm', 'https://management.azure.com/x')
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
