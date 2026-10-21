import type { TokenClaims } from './jwt'
import { API_RESOURCES, isExpectedAudience, type ApiKind } from './resources'

/** Warn when a token has less than this left. az tokens typically last 60–90 minutes. */
export const EXPIRY_WARNING_MS = 10 * 60 * 1000

/** A problem with a pasted token. Blocking ones stop requests; the rest are warnings on the token screen. */
export type TokenIssue =
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
export function isBlockingIssue(issue: TokenIssue): boolean {
  return issue.kind === 'wrong-audience' || issue.kind === 'expired'
}

export function checkToken({
  api,
  claims,
  tenantId,
  now = Date.now(),
}: TokenCheckInput): TokenIssue[] {
  const issues: TokenIssue[] = []
  if (!claims.audiences.some((aud) => isExpectedAudience(api, aud))) {
    issues.push({
      kind: 'wrong-audience',
      expected: API_RESOURCES[api].resource,
      actual: claims.audiences.join(', ') || '(none)',
    })
  }
  const expected = tenantId?.trim().toLowerCase()
  if (expected && claims.tid?.toLowerCase() !== expected) {
    issues.push({ kind: 'tenant-mismatch', expected, actual: claims.tid ?? '(none)' })
  }
  const msLeft = claims.expiresAt - now
  if (msLeft <= 0) {
    issues.push({ kind: 'expired' })
  } else if (msLeft < EXPIRY_WARNING_MS) {
    issues.push({ kind: 'expiring-soon', msLeft })
  }
  return issues
}
