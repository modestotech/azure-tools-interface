import type { AccessModel, Backend, OperationAccess, Principal, Severity } from '@/domain'
import { principalLabel } from '@/domain'
import { operationFindings, outboundText, worstSeverity } from '../shared/summaries'

/**
 * The graph the view draws, from the access model: principal / group member → operation →
 * backend, laid out left to right in four columns. Pure; React Flow and elkjs only see the result.
 *
 * Groups start collapsed: their direct members are drawn only once the group is expanded, so a
 * big group doesn't flood the graph.
 */

/** Left to right: group members, role holders, operations, backends. */
export type Column = 0 | 1 | 2 | 3

export type AccessNode =
  | {
      readonly id: string
      readonly kind: 'principal'
      readonly column: Column
      readonly principal: Principal
      /** Groups only: how many direct members, and whether they are drawn. */
      readonly members: number | undefined
      readonly expanded: boolean
    }
  | {
      readonly id: string
      readonly kind: 'operation'
      readonly column: Column
      readonly access: OperationAccess
      readonly severity: Severity | undefined
    }
  | {
      readonly id: string
      readonly kind: 'backend'
      readonly column: Column
      readonly backendKey: string
      /** Undefined while loading, or when the backend doesn't exist. */
      readonly backend: Backend | undefined
    }

export interface AccessGraphEdge {
  readonly id: string
  readonly kind: 'grant' | 'membership' | 'route'
  readonly source: string
  readonly target: string
  readonly label: string | undefined
  /** False for a group member that doesn't get the group's roles; drawn greyed out. */
  readonly effective: boolean
}

export interface AccessGraph {
  readonly nodes: readonly AccessNode[]
  readonly edges: readonly AccessGraphEdge[]
}

export const principalNodeId = (id: string) => `principal:${id}`
export const operationNodeId = (id: string) => `operation:${id}`
export const backendNodeId = (key: string) => `backend:${key}`

/** A short title for a node, shared by the node card, its details and the tests. */
export function nodeTitle(node: AccessNode): string {
  switch (node.kind) {
    case 'principal':
      return principalLabel(node.principal)
    case 'operation':
      return `${node.access.operation.method} ${node.access.operation.urlTemplate}`
    case 'backend':
      return node.backend?.title ?? node.backend?.backendId ?? node.backendKey
  }
}

/**
 * The graph of the operations in `shown` (all of them when undefined): their role holders, the
 * members of expanded groups among those, and their backends.
 */
export function graphElements(
  model: AccessModel,
  expanded: ReadonlySet<string>,
  shown?: ReadonlySet<string>,
): AccessGraph {
  const isShown = (operationId: string) => !shown || shown.has(operationId)
  const operations = model.operations.filter((access) => isShown(access.operation.id))
  const outbound = new Map(operations.map((access) => [access.operation.id, access.outbound]))
  const edges: AccessGraphEdge[] = []
  const grantees = new Set<string>()
  for (const edge of model.edges) {
    if (edge.kind !== 'grant' || !isShown(edge.operationId)) continue
    grantees.add(edge.principalId)
    edges.push({
      id: `grant:${edge.principalId}:${edge.operationId}`,
      kind: 'grant',
      source: principalNodeId(edge.principalId),
      target: operationNodeId(edge.operationId),
      label: edge.roles.join(', '),
      effective: true,
    })
  }

  const memberCount = new Map<string, number>()
  const members = new Set<string>()
  const backendKeys = new Set<string>()
  for (const edge of model.edges) {
    if (edge.kind === 'membership' && grantees.has(edge.groupId)) {
      memberCount.set(edge.groupId, (memberCount.get(edge.groupId) ?? 0) + 1)
      if (!expanded.has(edge.groupId)) continue
      members.add(edge.memberId)
      // Drawn member → group, so the graph reads left to right towards the operations.
      edges.push({
        id: `membership:${edge.groupId}:${edge.memberId}`,
        kind: 'membership',
        source: principalNodeId(edge.memberId),
        target: principalNodeId(edge.groupId),
        label: edge.effective ? undefined : 'not effective',
        effective: edge.effective,
      })
    } else if (edge.kind === 'route' && isShown(edge.operationId)) {
      backendKeys.add(edge.backendKey)
      const auth = outbound.get(edge.operationId)
      edges.push({
        id: `route:${edge.operationId}:${edge.backendKey}`,
        kind: 'route',
        source: operationNodeId(edge.operationId),
        target: backendNodeId(edge.backendKey),
        label: auth?.mechanism === 'ManagedIdentity' ? 'managed identity' : outboundText(auth),
        effective: true,
      })
    }
  }

  const principalNodes = [...model.principals.values()]
    .filter((principal) => grantees.has(principal.id) || members.has(principal.id))
    .map((principal): AccessNode => ({
      id: principalNodeId(principal.id),
      kind: 'principal',
      column: grantees.has(principal.id) ? 1 : 0,
      principal,
      members: principal.kind === 'group' ? (memberCount.get(principal.id) ?? 0) : undefined,
      expanded: expanded.has(principal.id),
    }))
  const operationNodes = operations.map((access): AccessNode => ({
    id: operationNodeId(access.operation.id),
    kind: 'operation',
    column: 2,
    access,
    severity: worstSeverity(operationFindings(model, access.operation.id)),
  }))
  const backendNodes = [...backendKeys].map((key): AccessNode => ({
    id: backendNodeId(key),
    kind: 'backend',
    column: 3,
    backendKey: key,
    backend: model.backends.get(key),
  }))
  return { nodes: [...principalNodes, ...operationNodes, ...backendNodes], edges }
}
