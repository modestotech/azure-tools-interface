import { FINDING_INFO, type FindingKind } from '@/domain'
import { operationsText } from '../operations'
import type { ScriptDefinition } from '../types'

/** Where calls go unprotected: plain HTTP, no credentials, or an identity with no role there. */
const BACKEND_KINDS: ReadonlySet<FindingKind> = new Set([
  'http-backend',
  'no-outbound-auth',
  'no-backend-url',
  'backend-not-found',
  'identity-not-found',
  'resource-not-found',
  'identity-has-no-role',
])

export const backendIssuesScript: ScriptDefinition = {
  id: 'backend-issues',
  title: 'HTTP and no-outbound-auth backends',
  description:
    'Backends reached over plain HTTP or without credentials, and managed identities with no role on the target.',
  params: [],
  run(model) {
    const backendOf = new Map(
      model.operations.flatMap(({ operation, backend }) =>
        backend ? [[operation.id, backend.backendKey] as const] : [],
      ),
    )
    // One row per backend and issue, listing the operations it affects.
    const groups = new Map<
      string,
      { backendKey: string; kind: FindingKind; operations: string[] }
    >()
    for (const finding of model.findings) {
      if (!BACKEND_KINDS.has(finding.kind) || !('operationId' in finding)) continue
      const backendKey =
        'backendKey' in finding ? finding.backendKey : (backendOf.get(finding.operationId) ?? '')
      const key = `${backendKey}|${finding.kind}`
      const group = groups.get(key) ?? { backendKey, kind: finding.kind, operations: [] }
      group.operations.push(finding.operationId)
      groups.set(key, group)
    }
    const rows = [...groups.values()].map(({ backendKey, kind, operations }) => {
      const backend = model.backends.get(backendKey)
      return {
        backend: backend?.title ?? backend?.backendId ?? backendKey,
        url: backend?.url,
        severity: FINDING_INFO[kind].severity,
        issue: FINDING_INFO[kind].title,
        operations: operationsText(model, operations),
      }
    })
    return {
      columns: [
        { key: 'backend', title: 'Backend' },
        { key: 'url', title: 'URL' },
        { key: 'severity', title: 'Severity' },
        { key: 'issue', title: 'Issue' },
        { key: 'operations', title: 'Operations' },
      ],
      rows,
    }
  },
}
