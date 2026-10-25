import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { parseApimServiceId, type ApimServiceRef, type ArmApi } from '@/services/arm'
import { apiSchema } from '@/services/arm/schemas'
import { HttpClientContext } from '@/services/query'
import { armFixtures, SERVICE_ID } from '@/test/fixtures/arm'
import { ALICE, BOB, ORDERS_READERS, REPORTING_MI_SP, WEBSHOP_SP } from '@/test/fixtures/graph'
import { testClient } from '@/test/helpers/testClient'
import { useAccessModel } from './useAccessModel'

const svc = parseApimServiceId(SERVICE_ID)
const ordersApi = apiSchema.parse(armFixtures.apis[0])

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

describe('useAccessModel', () => {
  it('loads the whole waterfall for one API and builds the complete model', async () => {
    const { log, wrapper } = setup()
    const { result } = renderHook(() => useAccessModel(svc, ordersApi, true), { wrapper })

    await waitFor(
      () => {
        expect(result.current?.pending).toEqual([])
        expect(result.current?.edges.some((edge) => edge.kind === 'membership')).toBe(true)
      },
      { timeout: 3000 },
    )
    const model = result.current
    expect(model?.problems).toEqual([])
    expect(
      model?.edges.filter((edge) => edge.kind === 'grant').map((edge) => edge.principalId),
    ).toEqual([WEBSHOP_SP.id, ORDERS_READERS.id, BOB.id, WEBSHOP_SP.id, ORDERS_READERS.id, BOB.id])
    expect(model?.principals.get(ALICE.id)?.kind).toBe('user')
    expect(model?.principals.get(REPORTING_MI_SP.id)?.kind).toBe('managedIdentity')
    expect(model?.principals.get(WEBSHOP_SP.id)).toMatchObject({ appId: WEBSHOP_SP.appId })
    expect(model?.findings.map((finding) => finding.kind).sort()).toEqual([
      'ineffective-member',
      'parent-inbound-ignored',
      'parent-inbound-ignored',
    ])

    const urls = log.getState().entries.map((entry) => `${entry.method} ${entry.url}`)
    expect(new Set(urls).size).toBe(urls.length)
    expect(urls.some((url) => url.includes('transitiveMembers'))).toBe(false)
  })

  it('fetches nothing and returns undefined until an API is chosen', () => {
    const { log, wrapper } = setup()
    const { result } = renderHook(
      ({ service, api }: { service: ApimServiceRef | undefined; api: ArmApi | undefined }) =>
        useAccessModel(service, api, true),
      { wrapper, initialProps: { service: svc, api: undefined } },
    )
    expect(result.current).toBeUndefined()
    // Even the service-level reads (identity, global policy) wait for the API.
    expect(log.getState().entries).toEqual([])
  })
})

describe('useAccessModel in ARM-only mode', () => {
  it('builds the model from ARM alone, without one Graph request', async () => {
    const { log, wrapper } = setup()
    const { result } = renderHook(() => useAccessModel(svc, ordersApi, false), { wrapper })
    await waitFor(
      () => {
        expect(result.current?.pending).toEqual([])
        expect(result.current?.operations.every((access) => access.outbound)).toBe(true)
      },
      { timeout: 3000 },
    )
    expect(result.current?.entra).toBe(false)
    expect(result.current?.problems).toEqual([])
    const entries = log.getState().entries
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.filter((entry) => entry.api !== 'arm')).toEqual([])
    expect(entries.every((entry) => entry.method === 'GET')).toBe(true)
  })
})
