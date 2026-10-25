import { ARM } from '@/test/msw/handlers'
import { filterEntries, policyProgress } from './filter'
import { logEntry as entry } from '@/test/helpers/logEntry'

const api = (name: string) =>
  `${ARM}/subscriptions/{sub}/resourceGroups/rg/providers/Microsoft.ApiManagement/service/apim/apis/${name}`
const policy = (apiName: string, op: string) =>
  `${api(apiName)}/operations/${op}/policies/policy?format=rawxml`

describe('filterEntries', () => {
  const lines = [
    entry({ id: 1, api: 'arm', state: 'ok' }),
    entry({ id: 2, api: 'graph', state: 'error' }),
    entry({ id: 3, api: 'graph', state: 'pending' }),
    entry({ id: 4, api: 'arm', state: 'cancelled' }),
  ]
  const ids = (filter: Parameters<typeof filterEntries>[1]) =>
    filterEntries(lines, filter).map((line) => line.id)

  it('filters by source and by status', () => {
    expect(ids({ source: 'all', status: 'all' })).toEqual([1, 2, 3, 4])
    expect(ids({ source: 'graph', status: 'all' })).toEqual([2, 3])
    expect(ids({ source: 'all', status: 'problems' })).toEqual([2, 4])
    expect(ids({ source: 'graph', status: 'pending' })).toEqual([3])
  })
})

describe('policyProgress', () => {
  it('is undefined before any operation policy is requested', () => {
    expect(policyProgress([entry(), entry({ url: `${api('orders')}/policies/policy` })])).toBe(
      undefined,
    )
  })

  it('counts the operation policies of the API fetched last, each once', () => {
    const progress = policyProgress([
      entry({ id: 1, url: policy('old', 'a'), state: 'pending' }),
      entry({ id: 2, url: policy('orders', 'a'), state: 'error' }),
      entry({ id: 3, url: policy('orders', 'b'), state: 'ok' }),
      entry({ id: 4, url: policy('orders', 'c'), state: 'pending' }),
      // Fetched again after a token change: the latest request counts.
      entry({ id: 5, url: policy('orders', 'a'), state: 'pending' }),
    ])
    expect(progress).toEqual({ done: 1, total: 3 })
  })
})
