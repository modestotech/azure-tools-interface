import type { AccessModel } from './mapper'
import type { Principal } from './model'

/**
 * Who reaches which operation, and how: a role held directly, or a role a group holds, reached by
 * a direct member. Read from the model's grant and membership edges; nothing is re-checked here.
 */

export type ReachPath =
  | {
      readonly kind: 'direct'
      readonly operationId: string
      /** The required role values the principal holds. */
      readonly roles: readonly string[]
    }
  | {
      readonly kind: 'group'
      readonly operationId: string
      readonly groupId: string
      readonly roles: readonly string[]
      /** False for an app or managed identity: group roles only reach users. */
      readonly effective: boolean
      readonly reason: string | undefined
    }

export interface PrincipalReach {
  readonly principal: Principal
  readonly paths: readonly ReachPath[]
}

/** Whether a path lets the principal call (a group itself never calls; its members do). */
export function canCall(principal: Principal, path: ReachPath): boolean {
  if (path.kind === 'group') return path.effective
  return principal.kind !== 'group'
}

export const principalLabel = (principal: Principal) => principal.displayName ?? principal.id

export const PRINCIPAL_KIND_LABEL: Readonly<Record<Principal['kind'], string>> = {
  servicePrincipal: 'App',
  managedIdentity: 'Managed identity',
  user: 'User',
  group: 'Group',
  other: 'Other',
}

type Membership = Extract<AccessModel['edges'][number], { kind: 'membership' }>

/** Every principal in the model with the operations it reaches, sorted by name. */
export function principalReach(model: AccessModel): PrincipalReach[] {
  const members = new Map<string, Membership[]>()
  for (const edge of model.edges) {
    if (edge.kind === 'membership')
      members.set(edge.groupId, [...(members.get(edge.groupId) ?? []), edge])
  }
  const paths = new Map<string, ReachPath[]>()
  const add = (id: string, path: ReachPath) => {
    paths.set(id, [...(paths.get(id) ?? []), path])
  }
  for (const edge of model.edges) {
    if (edge.kind !== 'grant') continue
    const { principalId, operationId, roles } = edge
    add(principalId, { kind: 'direct', operationId, roles })
    for (const member of members.get(principalId) ?? []) {
      const { effective, reason } = member
      add(member.memberId, {
        kind: 'group',
        operationId,
        groupId: principalId,
        roles,
        effective,
        reason,
      })
    }
  }
  return [...model.principals.values()]
    .map((principal) => ({ principal, paths: paths.get(principal.id) ?? [] }))
    .sort((a, b) => principalLabel(a.principal).localeCompare(principalLabel(b.principal)))
}

/** Per operation, the principals that can call it. */
export function callersByOperation(model: AccessModel): Map<string, Set<string>> {
  const callers = new Map<string, Set<string>>()
  for (const { principal, paths } of principalReach(model)) {
    for (const path of paths) {
      if (!canCall(principal, path)) continue
      const set = callers.get(path.operationId) ?? new Set()
      set.add(principal.id)
      callers.set(path.operationId, set)
    }
  }
  return callers
}

/**
 * The operations a principal reaches: those it can call, or for a group, those it grants to its
 * members.
 */
export function reachedOperationIds({ principal, paths }: PrincipalReach): Set<string> {
  const reaching =
    principal.kind === 'group'
      ? paths.filter((path) => path.kind === 'direct')
      : paths.filter((path) => canCall(principal, path))
  return new Set(reaching.map((path) => path.operationId))
}
