import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SERVICE_ID } from '@/test/fixtures/arm'
import { ORDERS_API_SP, ORDERS_READERS } from '@/test/fixtures/graph'
import { testClient } from '@/test/helpers/testClient'
import {
  parseApimServiceId,
  useApis,
  useBackends,
  useOperationPolicies,
  type ApimServiceRef,
} from './arm'
import { useGroupMembers, useServicePrincipalByAppId } from './graph'
import { HttpClientContext, useHttpClient } from './query'

const svc = parseApimServiceId(SERVICE_ID)

/** Fresh cache and client per test, with the app's query defaults that matter here. */
function setup() {
  const { client, log } = testClient()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <HttpClientContext value={client}>{children}</HttpClientContext>
    </QueryClientProvider>
  )
  return { log, wrapper }
}

describe('query hooks', () => {
  it('stay idle until their inputs are chosen, then load', async () => {
    const { log, wrapper } = setup()
    const { result, rerender } = renderHook(
      ({ service }: { service: ApimServiceRef | undefined }) => useApis(service),
      { wrapper, initialProps: { service: undefined as ApimServiceRef | undefined } },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(log.getState().entries).toHaveLength(0)

    rerender({ service: svc })
    await waitFor(() => {
      expect(result.current.data?.status).toBe('ok')
    })
    expect(log.getState().entries).toHaveLength(1)
  })

  it('share one request between hooks with the same key', async () => {
    const { log, wrapper } = setup()
    const { result } = renderHook(() => [useApis(svc), useApis(svc)], { wrapper })
    await waitFor(() => {
      expect(result.current.every((query) => query.data?.status === 'ok')).toBe(true)
    })
    expect(log.getState().entries).toHaveLength(1)
  })

  it('load one result per operation policy, keyed by operation, a missing policy being empty', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(
      () => useOperationPolicies(svc, 'orders-api', ['list-orders', 'create-order']),
      { wrapper },
    )
    await waitFor(() => {
      expect([...result.current.values()].every((data) => data !== undefined)).toBe(true)
    })
    expect(result.current.get('list-orders')).toEqual({ status: 'empty' })
    expect(result.current.get('create-order')?.status).toBe('ok')
  })

  it('keep the same result Map across renders while nothing changes', async () => {
    const { wrapper } = setup()
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useOperationPolicies(svc, 'orders-api', ids),
      { wrapper, initialProps: { ids: ['list-orders'] } },
    )
    await waitFor(() => {
      expect(result.current.get('list-orders')).toBeDefined()
    })
    const first = result.current
    rerender({ ids: ['list-orders'] })
    expect(result.current).toBe(first)
  })

  it('settle a refused backend-id as an error, without sending anything', async () => {
    const { log, wrapper } = setup()
    const { result } = renderHook(() => useBackends(svc, ['../../x']), { wrapper })
    await waitFor(() => {
      expect(result.current.get('../../x')).toMatchObject({
        status: 'error',
        error: { kind: 'invalid-request' },
      })
    })
    expect(log.getState().entries).toHaveLength(0)
  })

  it('load Graph data the same way', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(
      () => ({
        sp: useServicePrincipalByAppId(ORDERS_API_SP.appId),
        members: useGroupMembers([ORDERS_READERS.id]),
      }),
      { wrapper },
    )
    await waitFor(() => {
      expect(result.current.members.get(ORDERS_READERS.id)?.status).toBe('ok')
    })
    await waitFor(() => {
      expect(result.current.sp.data?.status).toBe('ok')
    })
    const members = result.current.members.get(ORDERS_READERS.id)
    expect(members?.status === 'ok' && members.data.map((m) => m.kind)).toEqual([
      'user',
      'servicePrincipal',
    ])
  })

  it('need an HttpClientContext', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useHttpClient())).toThrow('HttpClientContext')
  })
})
