import type { AccessModel, Backend, Finding, OutboundAuth, PolicyScope, Severity } from '@/domain'
import { callersByOperation } from '../shared/reach'
import {
  authSummary,
  authText,
  findingText,
  operationFindings,
  outboundText,
  worstSeverity,
  type AuthSummary,
} from '../shared/summaries'

/**
 * One table row per operation, derived from the access model. Pure, so the table, its export and
 * the tests all read the same values.
 */

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

export function operationRows(model: AccessModel): OperationRow[] {
  const callers = callersByOperation(model)
  return model.operations.map((access) => {
    const { operation, backend, outbound, policy } = access
    const findings = operationFindings(model, operation.id)
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

export function backendText(row: OperationRow): string {
  return row.backend?.url ?? row.backend?.title ?? (row.backendSource ? 'unknown' : 'loading…')
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
