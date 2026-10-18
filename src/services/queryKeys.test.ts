import { queryKeys } from './queryKeys'

describe('queryKeys', () => {
  it('nests API-scoped keys under the service key, so a prefix invalidates them all', () => {
    const service = queryKeys.arm.service('sub', 'svc')
    const opPolicy = queryKeys.arm.operationPolicy('sub', 'svc', 'api', 'op')
    expect(opPolicy.slice(0, service.length)).toEqual(service)
  })

  it('starts every key with its API, matching the request log', () => {
    expect(queryKeys.arm.apis('s', 'v')[0]).toBe('arm')
    expect(queryKeys.graph.spByAppId('a')).toEqual(['graph', 'sp', 'a'])
  })

  it('keeps lookups by appId, id and name distinct', () => {
    const same = '00000000-0000-0000-0000-000000000001'
    const keys = [
      queryKeys.graph.spByAppId(same),
      queryKeys.graph.spById(same),
      queryKeys.graph.spByName(same),
    ].map((k) => JSON.stringify(k))
    expect(new Set(keys).size).toBe(3)
  })
})
