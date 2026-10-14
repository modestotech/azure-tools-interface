import { z } from 'zod'

/** The claims the app reads. Signature is not validated: the token is only inspected, Azure validates it. */
const claimsSchema = z.looseObject({
  aud: z.union([z.string(), z.array(z.string())]),
  tid: z.string().optional(),
  oid: z.string().optional(),
  upn: z.string().optional(),
  unique_name: z.string().optional(),
  preferred_username: z.string().optional(),
  name: z.string().optional(),
  appid: z.string().optional(),
  exp: z.number(),
  iat: z.number().optional(),
})

export interface TokenClaims {
  readonly aud: string
  readonly tid: string | undefined
  readonly oid: string | undefined
  /** Best available sign-in name: `upn`, then `unique_name`, then `preferred_username`. */
  readonly upn: string | undefined
  readonly name: string | undefined
  readonly appid: string | undefined
  /** Expiry as epoch milliseconds. */
  readonly expiresAt: number
}

export type DecodeResult =
  | { readonly ok: true; readonly claims: TokenClaims }
  | { readonly ok: false; readonly error: string }

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** Strips whitespace, quotes and a leading "Bearer " that often come along when pasting. */
export function normalizeToken(raw: string): string {
  return raw
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^Bearer\s+/i, '')
    .trim()
}

/** Decodes a JWT payload. Error messages never include the token itself. */
export function decodeJwt(raw: string): DecodeResult {
  const token = normalizeToken(raw)
  const parts = token.split('.')
  const payload = parts[1]
  if (parts.length !== 3 || !payload) {
    return { ok: false, error: 'Not a JWT: expected three dot-separated parts.' }
  }
  let json: unknown
  try {
    json = JSON.parse(base64UrlDecode(payload))
  } catch {
    return { ok: false, error: 'Not a JWT: the payload is not valid base64url-encoded JSON.' }
  }
  const parsed = claimsSchema.safeParse(json)
  if (!parsed.success) {
    return { ok: false, error: 'Token payload is missing required claims (aud, exp).' }
  }
  const c = parsed.data
  return {
    ok: true,
    claims: {
      aud: Array.isArray(c.aud) ? (c.aud[0] ?? '') : c.aud,
      tid: c.tid,
      oid: c.oid,
      upn: c.upn ?? c.unique_name ?? c.preferred_username,
      name: c.name,
      appid: c.appid,
      expiresAt: c.exp * 1000,
    },
  }
}
