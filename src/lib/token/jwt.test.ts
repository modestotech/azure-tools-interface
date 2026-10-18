import { armToken, fakeJwt, TEST_TENANT } from '@/test/helpers/fakeJwt'
import { decodeJwt, normalizeToken } from './jwt'

describe('decodeJwt', () => {
  it('reads aud, tid, oid, upn and exp', () => {
    const result = decodeJwt(armToken({ exp: 2_000_000_000 }))
    expect(result).toEqual({
      ok: true,
      claims: expect.objectContaining({
        aud: 'https://management.azure.com',
        tid: TEST_TENANT,
        oid: '00000000-0000-0000-0000-000000000001',
        upn: 'dev@contoso.example.net',
        expiresAt: 2_000_000_000_000,
      }) as unknown,
    })
  })

  it('falls back to unique_name, then preferred_username, for the sign-in name', () => {
    const a = decodeJwt(fakeJwt({ aud: 'x', exp: 1, unique_name: 'a@example.net' }))
    const b = decodeJwt(fakeJwt({ aud: 'x', exp: 1, preferred_username: 'b@example.net' }))
    expect(a.ok && a.claims.upn).toBe('a@example.net')
    expect(b.ok && b.claims.upn).toBe('b@example.net')
  })

  it('handles non-ASCII claims (base64url + UTF-8)', () => {
    const result = decodeJwt(fakeJwt({ aud: 'x', exp: 1, name: 'Åsa Öberg' }))
    expect(result.ok && result.claims.name).toBe('Åsa Öberg')
  })

  it('accepts tokens pasted with quotes, whitespace or a Bearer prefix', () => {
    const token = armToken()
    expect(decodeJwt(`  "${token}"\n`).ok).toBe(true)
    expect(decodeJwt(`Bearer ${token}`).ok).toBe(true)
    expect(normalizeToken(`'Bearer ${token}'`)).toBe(token)
  })

  it('rejects malformed input without echoing it', () => {
    const secretish = 'not.a-valid-token-but-looks-secret'
    for (const input of ['', 'abc', 'a.b', secretish, 'a.b.c.d']) {
      const result = decodeJwt(input)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).not.toContain(secretish)
    }
  })

  it('keeps every audience when aud is an array', () => {
    const result = decodeJwt(fakeJwt({ aud: ['x', 'https://graph.microsoft.com'], exp: 1 }))
    expect(result.ok && result.claims.audiences).toEqual(['x', 'https://graph.microsoft.com'])
    expect(result.ok && result.claims.aud).toBe('x')
  })

  it('rejects payloads without aud or exp', () => {
    expect(decodeJwt(fakeJwt({ tid: TEST_TENANT })).ok).toBe(false)
  })
})
