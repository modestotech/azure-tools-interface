import type {
  AccessModel,
  Finding,
  JwtValidationRule,
  OperationAccess,
  OutboundAuth,
  PolicyScope,
  Severity,
} from '@/domain'
import { FINDING_INFO } from '@/domain'

/** Summaries of the access model shared by the views. Pure, so views, exports and tests agree. */

const ROLES_CLAIM = 'roles'

export const unique = <T>(values: Iterable<T>) => [...new Set(values)]

export type AuthSummary =
  | { readonly kind: 'loading' }
  /** Part of the policy couldn't be loaded or parsed, so who may call is unknown. */
  | { readonly kind: 'unreadable'; readonly scopes: readonly PolicyScope[] }
  | { readonly kind: 'none' }
  | {
      readonly kind: 'jwt'
      /** Required `roles` values; empty when the token needs no role. */
      readonly roles: readonly string[]
      readonly match: 'any' | 'all' | undefined
      /** Scopes the `validate-jwt` rules come from. */
      readonly scopes: readonly PolicyScope[]
    }

export function authSummary(access: OperationAccess): AuthSummary {
  if (!access.policy) return { kind: 'loading' }
  if (access.policy.unreadable.length > 0) {
    return { kind: 'unreadable', scopes: access.policy.unreadable }
  }
  const jwt = access.policy.rules.filter(
    (rule): rule is JwtValidationRule => rule.kind === 'validate-jwt',
  )
  if (jwt.length === 0) return { kind: 'none' }
  const claims = jwt.flatMap((rule) =>
    rule.requiredClaims.filter((claim) => claim.name === ROLES_CLAIM),
  )
  return {
    kind: 'jwt',
    roles: unique(claims.flatMap((claim) => claim.values)),
    match: claims[0]?.match,
    scopes: unique(jwt.map((rule) => rule.source.scope)),
  }
}

const SEVERITY_ORDER: readonly Severity[] = ['high', 'medium', 'info']

export function worstSeverity(findings: readonly Finding[]): Severity | undefined {
  return SEVERITY_ORDER.find((severity) =>
    findings.some((finding) => FINDING_INFO[finding.kind].severity === severity),
  )
}

/** The findings raised for one operation. */
export function operationFindings(model: AccessModel, operationId: string): Finding[] {
  return model.findings.filter(
    (finding) => 'operationId' in finding && finding.operationId === operationId,
  )
}

// Text forms, shared by the cells, the details panels and the CSV/JSON export.

export function authText(auth: AuthSummary): string {
  switch (auth.kind) {
    case 'loading':
      return 'loading…'
    case 'unreadable':
      return unreadableText(auth.scopes)
    case 'none':
      return 'none'
    case 'jwt':
      return auth.roles.length === 0
        ? 'token, no role required'
        : `roles (${auth.match ?? 'all'}): ${auth.roles.join(', ')}`
  }
}

/** `entra` false (ARM-only mode): the roles held there weren't looked up, so it says so. */
export function outboundText(outbound: OutboundAuth | undefined, entra: boolean): string {
  if (!outbound) return 'loading…'
  if (outbound.mechanism === 'None') return 'none'
  const identity = outbound.clientId ? 'user-assigned identity' : 'system-assigned identity'
  if (!entra) return `${identity} → ${outbound.resource} (roles need Entra)`
  const roles = outbound.roles.map((role) => role.value ?? role.displayName ?? role.id)
  return `${identity} → ${outbound.resource}${roles.length > 0 ? ` (roles: ${roles.join(', ')})` : ''}`
}

/** Shown for anything that depends on a policy that couldn't be loaded or parsed. */
export function unreadableText(scopes: readonly PolicyScope[]): string {
  return `unknown: the ${scopes.join(' and ')} policy could not be read`
}

/** An operation's outbound auth, or why it's unknown. */
export function operationOutboundText(access: OperationAccess, entra: boolean): string {
  const unreadable = access.policy?.unreadable ?? []
  return unreadable.length > 0 ? unreadableText(unreadable) : outboundText(access.outbound, entra)
}

/** Shown where a value can only come from Entra, in ARM-only mode. */
export const NEEDS_ENTRA = 'needs Entra'

export function findingText(finding: Finding): string {
  return FINDING_INFO[finding.kind].title
}
