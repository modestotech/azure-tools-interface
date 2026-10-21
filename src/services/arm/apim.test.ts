import { http, HttpResponse } from 'msw'
import { APIM_IDENTITY, SERVICE_ID, SERVICE_NAME } from '@/test/fixtures/arm'
import { TEST_SUB } from '@/test/helpers/fakeJwt'
import { testClient } from '@/test/helpers/testClient'
import { ARM } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import {
  getApimService,
  getApiPolicy,
  getBackend,
  getGlobalPolicy,
  getOperationPolicy,
  listApimServices,
  listApis,
  listOperations,
  listSubscriptions,
} from './apim'
import { parseApimServiceId } from './urls'

const svc = parseApimServiceId(SERVICE_ID)

describe('ARM picker data', () => {
  it('lists subscriptions', async () => {
    const { client } = testClient()
    await expect(listSubscriptions(client)).resolves.toEqual({
      status: 'ok',
      data: [{ subscriptionId: TEST_SUB, displayName: 'Contoso Integration', state: 'Enabled' }],
    })
  })

  it("lists a subscription's APIM services with their user-assigned identities", async () => {
    const { client } = testClient()
    const result = await listApimServices(client, TEST_SUB)
    expect(result).toEqual({
      status: 'ok',
      data: [
        {
          id: SERVICE_ID,
          name: SERVICE_NAME,
          location: 'Sweden Central',
          identity: {
            type: 'SystemAssigned, UserAssigned',
            systemAssignedPrincipalId: '00000000-0000-0000-0000-000000000013',
            userAssigned: [APIM_IDENTITY],
          },
        },
      ],
    })
  })

  it('lists APIs with their serviceUrl, and logs the masked query key', async () => {
    const { client, log } = testClient()
    const result = await listApis(client, svc)
    expect(result.status === 'ok' && result.data.map((api) => [api.name, api.serviceUrl])).toEqual([
      ['orders-api', 'https://orders-default.contoso.example.net'],
      ['inventory-api', 'http://inventory.contoso.example.net'],
    ])
    expect(log.getState().entries[0]?.queryKey).toContain('{sub}')
    expect(log.getState().entries[0]?.queryKey).not.toContain(TEST_SUB)
  })
})

describe('ARM reads for the selected API', () => {
  it('reads the service identity and the operations', async () => {
    const { client } = testClient()
    const service = await getApimService(client, svc)
    expect(service.status === 'ok' && service.data.identity?.userAssigned).toEqual([APIM_IDENTITY])

    const operations = await listOperations(client, svc, 'orders-api')
    expect(operations).toEqual({
      status: 'ok',
      data: [
        expect.objectContaining({ name: 'list-orders', method: 'GET', urlTemplate: '/orders' }),
        expect.objectContaining({ name: 'create-order', method: 'POST', urlTemplate: '/orders' }),
      ],
    })
  })

  it('returns policy XML per scope, and a missing policy as empty (not an error)', async () => {
    const { client, log } = testClient()
    const results = await Promise.all([
      getGlobalPolicy(client, svc),
      getApiPolicy(client, svc, 'orders-api'),
      getApiPolicy(client, svc, 'inventory-api'),
      getOperationPolicy(client, svc, 'orders-api', 'create-order'),
      getOperationPolicy(client, svc, 'orders-api', 'list-orders'),
    ])
    const [global, ordersApi, inventoryApi, createOrder, listOrders] = results
    expect(global.status === 'ok' && global.data).toContain('<cors')
    expect(ordersApi.status === 'ok' && ordersApi.data).toContain('<validate-jwt')
    expect(createOrder.status === 'ok' && createOrder.data).toContain('<rate-limit')
    expect(inventoryApi).toEqual({ status: 'empty' })
    expect(listOrders).toEqual({ status: 'empty' })
    expect(log.getState().counters.errors).toBe(0)
  })

  it('reads a backend by URL only, keeping just the names of its credential mechanisms', async () => {
    const { client } = testClient()
    const result = await getBackend(client, svc, 'orders-backend')
    expect(result).toEqual({
      status: 'ok',
      data: expect.objectContaining({
        name: 'orders-backend',
        url: 'https://ca-contoso-orders.example.net/api',
        type: 'Single',
        tls: { validateCertificateChain: true, validateCertificateName: true },
        credentialMechanisms: ['header'],
      }) as unknown,
    })
    expect(JSON.stringify(result)).not.toContain('x-functions-key')
    expect(JSON.stringify(result)).not.toContain('orders-function-key')
    expect(result.status === 'ok' && result.data).not.toHaveProperty('resourceId')
  })

  it.each(['../../x', '..', 'a/b', 'x?y', ''])(
    'refuses backend-id "%s" as invalid-request without sending anything',
    async (backendId) => {
      const { client, log } = testClient()
      const result = await getBackend(client, svc, backendId)
      expect(result).toMatchObject({ status: 'error', error: { kind: 'invalid-request' } })
      expect(log.getState().entries).toHaveLength(0)
    },
  )

  it('reports a backend that does not exist as empty, and a 403 as forbidden', async () => {
    const { client } = testClient()
    await expect(getBackend(client, svc, 'no-such-backend')).resolves.toEqual({ status: 'empty' })

    server.use(
      http.get(`${ARM}/subscriptions/:sub/resourceGroups/:rg/providers/:p/service/:svc/apis`, () =>
        HttpResponse.json({ error: { code: 'AuthorizationFailed' } }, { status: 403 }),
      ),
    )
    await expect(listApis(client, svc)).resolves.toMatchObject({ status: 'forbidden' })
  })

  it('reports a response of the wrong shape as an error for that resource only', async () => {
    server.use(
      http.get(`${ARM}/subscriptions/:sub/resourceGroups/:rg/providers/:p/service/:svc`, () =>
        HttpResponse.json({ name: 42 }),
      ),
    )
    const { client } = testClient()
    await expect(getApimService(client, svc)).resolves.toMatchObject({
      status: 'error',
      error: { kind: 'invalid-response' },
    })
    await expect(listApis(client, svc)).resolves.toMatchObject({ status: 'ok' })
  })
})
