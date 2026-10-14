import { APIM_API_VERSION } from '@/services/arm/apiVersion'
import { ARM } from './handlers'

describe('MSW handlers', () => {
  it('intercepts ARM calls with the pinned api-version', async () => {
    const res = await fetch(
      `${ARM}/subscriptions/00000000-0000-0000-0000-000000000001/providers/Microsoft.ApiManagement/service?api-version=${APIM_API_VERSION}`,
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ value: [] })
  })

  it('fails on unhandled requests instead of reaching the network', async () => {
    await expect(fetch(`${ARM}/not-mocked`)).rejects.toThrow()
  })
})
