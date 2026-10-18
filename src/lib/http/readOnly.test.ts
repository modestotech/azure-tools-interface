import { assertReadOnly, GRAPH_BATCH_URL } from './readOnly'

const batch = (requests: unknown[]) => ({ requests })

describe('assertReadOnly', () => {
  it('allows GET without a body', () => {
    expect(() => {
      assertReadOnly('arm', 'GET', 'https://management.azure.com/x', undefined)
    }).not.toThrow()
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])('blocks %s to ARM', (method) => {
    expect(() => {
      assertReadOnly('arm', method, 'https://management.azure.com/x', undefined)
    }).toThrow(/only sends GET/)
  })

  it('blocks a GET carrying a body', () => {
    expect(() => {
      assertReadOnly('arm', 'GET', 'https://management.azure.com/x', {})
    }).toThrow()
  })

  it('allows Graph $batch when every sub-request is a GET', () => {
    expect(() => {
      assertReadOnly(
        'graph',
        'POST',
        GRAPH_BATCH_URL,
        batch([{ id: '1', method: 'GET', url: '/groups/a' }]),
      )
    }).not.toThrow()
  })

  it.each([
    ['a non-GET sub-request', batch([{ id: '1', method: 'DELETE', url: '/groups/a' }])],
    ['a sub-request with a body', batch([{ id: '1', method: 'GET', url: '/x', body: {} }])],
    [
      'an absolute sub-request URL',
      batch([{ id: '1', method: 'GET', url: 'https://evil.example.net/' }]),
    ],
    ['a protocol-relative sub-request URL', batch([{ id: '1', method: 'GET', url: '//evil' }])],
    ['a .. segment', batch([{ id: '1', method: 'GET', url: '/../beta/users' }])],
    ['a . segment', batch([{ id: '1', method: 'GET', url: '/groups/./a' }])],
    ['a percent-encoded ..', batch([{ id: '1', method: 'GET', url: '/groups/%2E%2E/x' }])],
    ['a backslash', batch([{ id: '1', method: 'GET', url: '/groups\\..\\x' }])],
    ['an empty batch', batch([])],
    [
      'more than 20 requests',
      batch(Array.from({ length: 21 }, (_, i) => ({ id: String(i), method: 'GET', url: '/x' }))),
    ],
    [
      'duplicate sub-request ids',
      batch([
        { id: '1', method: 'GET', url: '/a' },
        { id: '1', method: 'GET', url: '/b' },
      ]),
    ],
    ['a malformed body', 'requests'],
  ])('blocks $batch with %s', (_name, body) => {
    expect(() => {
      assertReadOnly('graph', 'POST', GRAPH_BATCH_URL, body)
    }).toThrow()
  })

  it('allows dots and slashes in the query string of a $batch sub-request', () => {
    const url = "/servicePrincipals?$filter=servicePrincipalNames/any(x:x eq 'api://a.b/c')"
    expect(() => {
      assertReadOnly('graph', 'POST', GRAPH_BATCH_URL, batch([{ id: '1', method: 'GET', url }]))
    }).not.toThrow()
  })

  it('blocks POST to any other Graph URL, and $batch with an ARM token', () => {
    const body = batch([{ id: '1', method: 'GET', url: '/x' }])
    expect(() => {
      assertReadOnly('graph', 'POST', 'https://graph.microsoft.com/v1.0/groups', body)
    }).toThrow()
    expect(() => {
      assertReadOnly('arm', 'POST', GRAPH_BATCH_URL, body)
    }).toThrow()
  })
})
