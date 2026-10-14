/** Builds an unsigned, fictional JWT for tests. Never use real tokens in tests. */
export function fakeJwt(payload: Record<string, unknown>): string {
  const enc = (value: unknown) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc(payload)}.signature`
}

export const TEST_TENANT = '00000000-0000-0000-0000-0000000000aa'
export const TEST_SUB = '00000000-0000-0000-0000-0000000000bb'

export function armToken(overrides: Record<string, unknown> = {}): string {
  return fakeJwt({
    aud: 'https://management.azure.com',
    tid: TEST_TENANT,
    oid: '00000000-0000-0000-0000-000000000001',
    upn: 'dev@contoso.example.net',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  })
}

export function graphToken(overrides: Record<string, unknown> = {}): string {
  return armToken({ aud: 'https://graph.microsoft.com', ...overrides })
}
