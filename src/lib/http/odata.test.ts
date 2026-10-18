import { odataString, withQuery } from './odata'

describe('odataString', () => {
  it('quotes values and doubles embedded single quotes', () => {
    expect(odataString('api://contoso-api')).toBe("'api://contoso-api'")
    expect(odataString("x') or true or ('")).toBe("'x'') or true or ('''")
  })
})

describe('withQuery', () => {
  it('percent-encodes values and keeps keys as written', () => {
    const filter = `servicePrincipalNames/any(x:x eq ${odataString('api://a&b')})`
    expect(
      withQuery('https://graph.microsoft.com/v1.0/servicePrincipals', {
        $filter: filter,
        $select: 'id,appId',
      }),
    ).toBe(
      "https://graph.microsoft.com/v1.0/servicePrincipals?$filter=servicePrincipalNames%2Fany(x%3Ax%20eq%20'api%3A%2F%2Fa%26b')&$select=id%2CappId",
    )
  })

  it('appends to an existing query string and skips undefined values', () => {
    expect(withQuery('https://x/y?a=1', { b: '2', c: undefined })).toBe('https://x/y?a=1&b=2')
    expect(withQuery('https://x/y', {})).toBe('https://x/y')
  })
})
