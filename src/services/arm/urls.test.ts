import { SERVICE_ID } from '@/test/fixtures/arm'
import { TEST_SUB } from '@/test/helpers/fakeJwt'
import { ARM } from '@/test/msw/handlers'
import { APIM_API_VERSION } from './apiVersion'
import { armUrls, parseApimServiceId } from './urls'

describe('parseApimServiceId', () => {
  it('splits a service resource ID, whatever the casing of the fixed parts', () => {
    expect(parseApimServiceId(SERVICE_ID)).toEqual({
      id: SERVICE_ID,
      subscriptionId: TEST_SUB,
      resourceGroup: 'rg-contoso-apim',
      name: 'apim-contoso',
    })
    const lower = `/subscriptions/${TEST_SUB}/resourcegroups/rg/providers/microsoft.apimanagement/service/apim`
    expect(parseApimServiceId(lower)).toMatchObject({ resourceGroup: 'rg', name: 'apim' })
  })

  it.each([
    [
      'another resource type',
      `/subscriptions/${TEST_SUB}/resourceGroups/rg/providers/Microsoft.Web/sites/x`,
    ],
    ['a child resource', `${SERVICE_ID}/apis/orders-api`],
    [
      'a subscription that is not a GUID',
      '/subscriptions/x/resourceGroups/rg/providers/Microsoft.ApiManagement/service/apim',
    ],
    ['a full URL', `${ARM}${SERVICE_ID}`],
  ])('refuses %s', (_, id) => {
    expect(() => parseApimServiceId(id)).toThrow(
      expect.objectContaining({ kind: 'invalid-request' }),
    )
  })
})

describe('armUrls', () => {
  const svc = parseApimServiceId(SERVICE_ID)

  it('builds policy URLs with the pinned api-version and rawxml format', () => {
    expect(armUrls.operationPolicy(svc, 'orders-api', 'create-order')).toBe(
      `${ARM}${SERVICE_ID}/apis/orders-api/operations/create-order/policies/policy?api-version=${APIM_API_VERSION}&format=rawxml`,
    )
  })

  it('percent-encodes IDs, and refuses ones that would change the path', () => {
    expect(armUrls.operations(svc, 'orders api;rev=2')).toContain('/apis/orders%20api%3Brev%3D2/')
    expect(() => armUrls.backend(svc, '../../x')).toThrow(
      expect.objectContaining({ kind: 'invalid-request' }),
    )
  })
})
