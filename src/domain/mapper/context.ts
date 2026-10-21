import type { AccessEdge, Backend, Principal } from '../model'
import type { AccessModelInputs, Collector } from './inputs'

/** What the inbound and outbound steps build up while the model is assembled. */
export interface MapperContext {
  readonly inputs: AccessModelInputs
  readonly collector: Collector
  readonly principals: Map<string, Principal>
  readonly backends: Map<string, Backend>
  readonly edges: AccessEdge[]
  /** `groupId/memberId` of membership edges already added; a group can grant many operations. */
  readonly memberships: Set<string>
}

/** The principal's fields that are known (not undefined). */
function knownFields(principal: Principal): Partial<Principal> {
  return Object.fromEntries(Object.entries(principal).filter(([, value]) => value !== undefined))
}

/**
 * Adds a principal, or fills in what an earlier sighting didn't know (a user found as a group
 * member has a UPN; one found in an assignment doesn't). Known values and the kind are kept.
 */
export function addPrincipal(context: MapperContext, principal: Principal): void {
  const known = context.principals.get(principal.id)
  if (known && known.kind !== principal.kind) return
  // Same kind on both sides, so the merge is still that kind.
  const merged = known ? ({ ...principal, ...knownFields(known) } as Principal) : principal
  context.principals.set(principal.id, merged)
}
