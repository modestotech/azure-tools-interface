import type { TokenClaims } from './jwt'
import { API_RESOURCES, isExpectedAudience, type ApiKind } from './resources'

/** Warn when a token has less than this left. az tokens typically last 60–90 minutes. */
export const EXPIRY_WARNING_MS = 10 * 60 * 1000

export type TokenWarning =
  | { readonly kind: 'wrong-audience'; readonly expected: string; readonly actual: string }
  | { readonly kind: 'tenant-mismatch'; readonly expected: string; readonly actual: string }
  | { readonly kind: 'expiring-soon'; readonly msLeft: number }
  | { readonly kind: 'expired' }

export interface TokenCheckInput {
  readonly api: ApiKind
  readonly claims: TokenClaims
  /** Tenant ID entered by the user. Skipped when empty. */
  readonly tenantId?: string | undefined
  readonly now?: number
}

/**
 * Problems that make a request pointless: Azure would answer 401. The HTTP client refuses to send
 * with these; the rest (tenant mismatch, expiring soon) are only shown as warnings.
 */
export function isBlockingWarning(warning: TokenWarning): boolean {
  return warning.kind === 'wrong-audience' || warning.kind === 'expired'
}

export function checkToken({
  api,
  claims,
  tenantId,
  now = Date.now(),
}: TokenCheckInput): TokenWarning[] {
  const warnings: TokenWarning[] = []
  if (!isExpectedAudience(api, claims.aud)) {
    warnings.push({
      kind: 'wrong-audience',
      expected: API_RESOURCES[api].resource,
      actual: claims.aud,
    })
  }
  const expected = tenantId?.trim().toLowerCase()
  if (expected && claims.tid?.toLowerCase() !== expected) {
    warnings.push({ kind: 'tenant-mismatch', expected, actual: claims.tid ?? '(none)' })
  }
  const msLeft = claims.expiresAt - now
  if (msLeft <= 0) {
    warnings.push({ kind: 'expired' })
  } else if (msLeft < EXPIRY_WARNING_MS) {
    warnings.push({ kind: 'expiring-soon', msLeft })
  }
  return warnings
}
