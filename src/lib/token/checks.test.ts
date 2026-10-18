import { armToken, graphToken, TEST_TENANT } from '@/test/helpers/fakeJwt'
import { checkToken, EXPIRY_WARNING_MS, isBlockingWarning } from './checks'
import { decodeJwt, type TokenClaims } from './jwt'
import { azTokenCommand, isExpectedAudience } from './resources'

function claims(token: string): TokenClaims {
  const r = decodeJwt(token)
  if (!r.ok) throw new Error(r.error)
  return r.claims
}

describe('checkToken', () => {
  const now = Date.now()

  it('returns no warnings for a fresh token with matching audience and tenant', () => {
    expect(
      checkToken({ api: 'arm', claims: claims(armToken()), tenantId: TEST_TENANT, now }),
    ).toEqual([])
  })

  it('flags a Graph token pasted into the ARM field', () => {
    const warnings = checkToken({ api: 'arm', claims: claims(graphToken()), now })
    expect(warnings).toContainEqual(
      expect.objectContaining({ kind: 'wrong-audience', actual: 'https://graph.microsoft.com' }),
    )
  })

  it('flags a tenant mismatch, case-insensitively', () => {
    const c = claims(armToken())
    expect(checkToken({ api: 'arm', claims: c, tenantId: TEST_TENANT.toUpperCase(), now })).toEqual(
      [],
    )
    expect(checkToken({ api: 'arm', claims: c, tenantId: 'other-tenant', now })).toContainEqual(
      expect.objectContaining({ kind: 'tenant-mismatch' }),
    )
  })

  it('skips the tenant check when no tenant is entered', () => {
    expect(checkToken({ api: 'arm', claims: claims(armToken()), tenantId: '  ', now })).toEqual([])
  })

  it('warns when the token expires soon, and when it has expired', () => {
    const soon = claims(armToken({ exp: Math.floor((now + EXPIRY_WARNING_MS / 2) / 1000) }))
    const past = claims(armToken({ exp: Math.floor((now - 1000) / 1000) }))
    expect(checkToken({ api: 'arm', claims: soon, now })).toEqual([
      { kind: 'expiring-soon', msLeft: soon.expiresAt - now },
    ])
    expect(checkToken({ api: 'arm', claims: past, now })).toEqual([{ kind: 'expired' }])
  })
})

describe('isExpectedAudience', () => {
  it.each([
    ['arm', 'https://management.azure.com/'],
    ['arm', 'https://management.core.windows.net/'],
    ['arm', '797f4846-ba00-4fd7-ba43-dac1f8f63013'],
    ['graph', 'https://graph.microsoft.com'],
    ['graph', '00000003-0000-0000-c000-000000000000'],
  ] as const)('%s accepts %s', (api, aud) => {
    expect(isExpectedAudience(api, aud)).toBe(true)
  })

  it('rejects the other API', () => {
    expect(isExpectedAudience('graph', 'https://management.azure.com')).toBe(false)
  })
})

describe('azTokenCommand', () => {
  it('builds the copyable command with the tenant filled in', () => {
    expect(azTokenCommand('graph', TEST_TENANT)).toBe(
      `az account get-access-token --resource https://graph.microsoft.com --tenant ${TEST_TENANT} --query accessToken -o tsv`,
    )
    expect(azTokenCommand('arm')).toContain('--tenant <TENANT_ID>')
  })
})

describe('isBlockingWarning', () => {
  it('blocks only on problems Azure would reject with 401', () => {
    expect(isBlockingWarning({ kind: 'wrong-audience', expected: 'a', actual: 'b' })).toBe(true)
    expect(isBlockingWarning({ kind: 'expired' })).toBe(true)
    expect(isBlockingWarning({ kind: 'tenant-mismatch', expected: 'a', actual: 'b' })).toBe(false)
    expect(isBlockingWarning({ kind: 'expiring-soon', msLeft: 1000 })).toBe(false)
  })
})
