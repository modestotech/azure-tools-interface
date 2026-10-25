import type {
  AccessModel,
  Backend,
  Finding,
  JwtValidationRule,
  OperationAccess,
  OutboundAuth,
  PolicyScope,
  Severity,
} from '@/domain'
import { FINDING_INFO } from '@/domain'

/**
 * One table row per operation, derived from the access model. Pure, so the table, its export and
 * the tests all read the same values.
 */

const ROLES_CLAIM = 'roles'

export type AuthSummary =
  | { readonly kind: 'loading' }
  | { readonly kind: 'none' }
  | {
      readonly kind: 'jwt'
      /** Required `roles` values; empty when the token needs no role. */
      readonly roles: readonly string[]
      readonly match: 'any' | 'all' | undefined
      /** Scopes the `validate-jwt` rules come from. */
      readonly scopes: readonly PolicyScope[]
    }

export interface OperationRow {
  readonly id: string
  readonly method: string
  readonly path: string
  readonly name: string
  readonly auth: AuthSummary
  /** Principals that can call: role holders other than groups, plus users in granting groups. */
  readonly callers: number
  readonly backend: Backend | undefined
  /** Where the backend was chosen: a policy scope, or `serviceUrl` when no policy sets one. */
  readonly backendSource: PolicyScope | 'serviceUrl' | undefined
  readonly outbound: OutboundAuth | undefined
  /** Elements outside the supported pattern: "needs manual review". */
  readonly needsReview: number
  readonly findings: readonly Finding[]
  /** The most severe finding's severity, if any. */
  readonly severity: Severity | undefined
}

const unique = <T>(values: Iterable<T>) => [...new Set(values)]

function authSummary(access: OperationAccess): AuthSummary {
  if (!access.policy) return { kind: 'loading' }
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

/** Callers per operation: direct non-group role holders, and users in a granting group. */
function callersByOperation(model: AccessModel): Map<string, Set<string>> {
  const effectiveMembers = new Map<string, string[]>()
  for (const edge of model.edges) {
    if (edge.kind !== 'membership' || !edge.effective) continue
    effectiveMembers.set(edge.groupId, [
      ...(effectiveMembers.get(edge.groupId) ?? []),
      edge.memberId,
    ])
  }
  const callers = new Map<string, Set<string>>()
  for (const edge of model.edges) {
    if (edge.kind !== 'grant') continue
    const set = callers.get(edge.operationId) ?? new Set()
    const principal = model.principals.get(edge.principalId)
    if (principal?.kind === 'group') {
      for (const member of effectiveMembers.get(edge.principalId) ?? []) set.add(member)
    } else {
      set.add(edge.principalId)
    }
    callers.set(edge.operationId, set)
  }
  return callers
}

const SEVERITY_ORDER: readonly Severity[] = ['high', 'medium', 'info']

export function worstSeverity(findings: readonly Finding[]): Severity | undefined {
  return SEVERITY_ORDER.find((severity) =>
    findings.some((finding) => FINDING_INFO[finding.kind].severity === severity),
  )
}

export function operationRows(model: AccessModel): OperationRow[] {
  const callers = callersByOperation(model)
  return model.operations.map((access) => {
    const { operation, backend, outbound, policy } = access
    const findings = model.findings.filter(
      (finding) => 'operationId' in finding && finding.operationId === operation.id,
    )
    return {
      id: operation.id,
      method: operation.method,
      path: operation.urlTemplate,
      name: operation.displayName,
      auth: authSummary(access),
      callers: callers.get(operation.id)?.size ?? 0,
      backend: backend && model.backends.get(backend.backendKey),
      backendSource: backend && (backend.source?.scope ?? 'serviceUrl'),
      outbound,
      needsReview: policy?.unresolved.length ?? 0,
      findings,
      severity: worstSeverity(findings),
    }
  })
}

// Text forms, shared by the cells and the CSV/JSON export.

export function authText(auth: AuthSummary): string {
  switch (auth.kind) {
    case 'loading':
      return 'loading…'
    case 'none':
      return 'none'
    case 'jwt':
      return auth.roles.length === 0
        ? 'token, no role required'
        : `roles (${auth.match ?? 'all'}): ${auth.roles.join(', ')}`
  }
}

export function backendText(row: OperationRow): string {
  return row.backend?.url ?? row.backend?.title ?? (row.backendSource ? 'unknown' : 'loading…')
}

export function outboundText(outbound: OutboundAuth | undefined): string {
  if (!outbound) return 'loading…'
  if (outbound.mechanism === 'None') return 'none'
  const identity = outbound.clientId ? 'user-assigned identity' : 'system-assigned identity'
  const roles = outbound.roles.map((role) => role.value ?? role.displayName ?? role.id)
  return `${identity} → ${outbound.resource}${roles.length > 0 ? ` (roles: ${roles.join(', ')})` : ''}`
}

export function findingText(finding: Finding): string {
  return FINDING_INFO[finding.kind].title
}

/** The row as plain values, for CSV and JSON. */
export function exportRow(row: OperationRow): Record<string, string | number> {
  return {
    method: row.method,
    path: row.path,
    name: row.name,
    auth: authText(row.auth),
    authScope: row.auth.kind === 'jwt' ? row.auth.scopes.join(', ') : '',
    callers: row.callers,
    backend: backendText(row),
    backendSource: row.backendSource ?? '',
    outboundAuth: outboundText(row.outbound),
    needsReview: row.needsReview,
    findings: row.findings.map(findingText).join('; '),
  }
}
