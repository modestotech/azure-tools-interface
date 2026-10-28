import type { AccessModel, Backend, Finding, FindingKind, OutboundAuth } from '@/domain'
import { appendTo } from '@/lib/collections'

/**
 * One entry per backend the API's operations route to, with how APIM authenticates there. Pure,
 * read from the model's route edges and each operation's outbound auth.
 */

/** Findings about where a call goes and how APIM authenticates there. */
const BACKEND_FINDINGS: ReadonlySet<FindingKind> = new Set([
  'backend-not-found',
  'no-backend-url',
  'http-backend',
  'no-outbound-auth',
  'identity-not-found',
  'no-system-identity',
  'resource-not-found',
  'identity-has-no-role',
])

/** One way APIM authenticates to the backend, and the operations that use it. */
export interface OutboundUse {
  readonly outbound: OutboundAuth
  /** The identity's name (its resource name), or which kind of identity it is. */
  readonly identity: string | undefined
  readonly operationIds: readonly string[]
}

export interface BackendRow {
  readonly key: string
  /** Undefined while loading, or when `set-backend-service` names a backend that doesn't exist. */
  readonly backend: Backend | undefined
  readonly missing: boolean
  readonly operationIds: readonly string[]
  readonly outbound: readonly OutboundUse[]
  /** One finding per kind; the same check usually fails for every operation on a backend. */
  readonly findings: readonly Finding[]
}

function outboundKey(outbound: OutboundAuth): string {
  return outbound.mechanism === 'None'
    ? 'none'
    : `${outbound.clientId ?? 'system'}|${outbound.resource}`
}

function identityName(model: AccessModel, outbound: OutboundAuth): string | undefined {
  if (outbound.mechanism === 'None') return undefined
  if (!outbound.clientId) return 'system-assigned identity'
  const clientId = outbound.clientId.toLowerCase()
  const identity = model.service?.userAssignedIdentities.find(
    (item) => item.clientId.toLowerCase() === clientId,
  )
  return identity?.resourceId.split('/').at(-1) ?? 'user-assigned identity'
}

function concerns(finding: Finding, key: string, operationIds: ReadonlySet<string>): boolean {
  if (!BACKEND_FINDINGS.has(finding.kind) || !('operationId' in finding)) return false
  if ('backendKey' in finding) return finding.backendKey === key
  return operationIds.has(finding.operationId)
}

export function backendRows(model: AccessModel): BackendRow[] {
  const routed = new Map<string, string[]>()
  for (const edge of model.edges) {
    if (edge.kind === 'route') appendTo(routed, edge.backendKey, edge.operationId)
  }
  return [...routed].map(([key, operationIds]) => {
    const ids = new Set(operationIds)
    const uses = new Map<string, OutboundUse>()
    for (const { operation, outbound } of model.operations) {
      if (!ids.has(operation.id) || !outbound) continue
      const use = uses.get(outboundKey(outbound)) ?? {
        outbound,
        identity: identityName(model, outbound),
        operationIds: [],
      }
      uses.set(outboundKey(outbound), { ...use, operationIds: [...use.operationIds, operation.id] })
    }
    const findings = new Map<FindingKind, Finding>()
    for (const finding of model.findings) {
      if (concerns(finding, key, ids) && !findings.has(finding.kind))
        findings.set(finding.kind, finding)
    }
    return {
      key,
      backend: model.backends.get(key),
      missing: findings.has('backend-not-found'),
      operationIds,
      outbound: [...uses.values()],
      findings: [...findings.values()],
    }
  })
}
