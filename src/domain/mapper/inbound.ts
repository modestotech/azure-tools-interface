import type { GraphServicePrincipal } from '@/services/graph'
import type { JwtValidationRule, OperationPolicy, RequiredClaim } from '../model'
import { addPrincipal, type MapperContext } from './context'
import { read } from './inputs'
import { memberPrincipal, servicePrincipalPrincipal } from './normalize'

/**
 * Inbound: who may call an operation. For each `validate-jwt`, the audience resolves to the API's
 * service principal(s); the role holders there (`appRoleAssignedTo`) whose roles meet the `roles`
 * claim get a grant edge, and each granting group's direct members get membership edges.
 *
 * Simplification: each path is checked on its own (direct, or through one group). A user who
 * meets a `match="all"` claim only by combining a direct role with a group role is not found.
 * With `match="any"` (the target pattern) this never matters.
 */

const ROLES_CLAIM = 'roles'

/** A principal holding roles on the API, with the role values it holds. */
interface Holder {
  readonly principalId: string
  readonly principalType: string | undefined
  readonly displayName: string | undefined
  readonly roles: Set<string>
}

export function meetsClaim(held: ReadonlySet<string>, claim: RequiredClaim): string[] {
  const matched = claim.values.filter((value) => held.has(value))
  const met = claim.match === 'any' ? matched.length > 0 : matched.length === claim.values.length
  return met ? matched : []
}

/** The service principals a rule's audiences resolve to, or undefined while any is unavailable. */
function audienceTargets(
  context: MapperContext,
  operationId: string,
  rule: JwtValidationRule,
): GraphServicePrincipal[] | undefined {
  const targets: GraphServicePrincipal[] = []
  let complete = true
  for (const audience of rule.audiences) {
    const what = `service principal for audience ${audience}`
    const found = read(context.collector, what, context.inputs.audiences.get(audience))
    if (found === undefined) complete = false
    else if (found === null || found.length === 0) {
      context.collector.findings.push({ kind: 'audience-not-found', operationId, audience })
    } else targets.push(...found)
  }
  return complete ? targets : undefined
}

/** Everyone holding a role with a value on `targets`, or undefined while assignments load. */
function holdersOn(context: MapperContext, targets: readonly GraphServicePrincipal[]) {
  const holders = new Map<string, Holder>()
  for (const target of targets) {
    const what = `role assignments on ${target.displayName ?? target.id}`
    const assignments = read(
      context.collector,
      what,
      context.inputs.appRoleAssignedTo.get(target.id),
    )
    if (assignments === undefined) return undefined
    const roleValues = new Map(target.appRoles.map((role) => [role.id, role.value]))
    for (const assignment of assignments ?? []) {
      // The all-zero "default access" role has no value and never appears in the roles claim.
      const value = roleValues.get(assignment.appRoleId)
      if (!value) continue
      const holder = holders.get(assignment.principalId) ?? {
        principalId: assignment.principalId,
        principalType: assignment.principalType,
        displayName: assignment.principalDisplayName,
        roles: new Set<string>(),
      }
      holder.roles.add(value)
      holders.set(holder.principalId, holder)
    }
  }
  return holders
}

function reportClaims(
  context: MapperContext,
  operationId: string,
  rule: JwtValidationRule,
  targets: readonly GraphServicePrincipal[],
): RequiredClaim | undefined {
  const { findings } = context.collector
  // Without <audiences>, APIM doesn't check `aud`: a token from the same issuer for any other app
  // passes. Callers can't be derived from that, so the rule grants nobody here, which would
  // otherwise look like "locked down" rather than "wide open".
  if (rule.audiences.length === 0) findings.push({ kind: 'no-audience', operationId })
  for (const claim of rule.requiredClaims) {
    if (claim.name !== ROLES_CLAIM)
      findings.push({ kind: 'unsupported-claim', operationId, claim: claim.name })
  }
  const rolesClaim = rule.requiredClaims.find((claim) => claim.name === ROLES_CLAIM)
  if (!rolesClaim) {
    findings.push({ kind: 'no-role-requirement', operationId })
    return undefined
  }
  if (targets.length > 0) {
    const defined = new Set(targets.flatMap((target) => target.appRoles.map((role) => role.value)))
    for (const role of rolesClaim.values) {
      if (!defined.has(role)) findings.push({ kind: 'unknown-role', operationId, role })
    }
  }
  return rolesClaim
}

/** Holder → matched roles for one rule; undefined while its data loads or if it has no roles claim. */
function callersOfRule(context: MapperContext, operationId: string, rule: JwtValidationRule) {
  const targets = audienceTargets(context, operationId, rule)
  const rolesClaim = reportClaims(context, operationId, rule, targets ?? [])
  if (!targets || !rolesClaim) return undefined
  const holders = holdersOn(context, targets)
  if (!holders) return undefined
  const callers = new Map<string, { holder: Holder; roles: string[] }>()
  for (const holder of holders.values()) {
    const roles = meetsClaim(holder.roles, rolesClaim)
    if (roles.length > 0) callers.set(holder.principalId, { holder, roles })
  }
  return callers
}

function addHolder(context: MapperContext, holder: Holder): void {
  const { principalId: id, displayName } = holder
  if (context.addedHolders.has(id)) return
  context.addedHolders.add(id)
  switch (holder.principalType) {
    case 'User':
      addPrincipal(context, { kind: 'user', id, displayName, userPrincipalName: undefined })
      return
    case 'Group':
      addPrincipal(context, { kind: 'group', id, displayName })
      return
    default: {
      const details = read(
        context.collector,
        'service principal details',
        context.inputs.principalDetails,
      )
      const detail = details?.get(id)
      addPrincipal(
        context,
        detail?.status === 'ok'
          ? servicePrincipalPrincipal(detail.data)
          : { kind: 'servicePrincipal', id, appId: undefined, displayName },
      )
    }
  }
}

const NOT_EFFECTIVE =
  'Group roles only reach users. An app or managed identity calling with its own identity gets only roles assigned to it directly.'

function addMembers(context: MapperContext, groupId: string, groupName: string | undefined): void {
  if (context.readGroups.has(groupId)) return
  context.readGroups.add(groupId)
  const what = `members of group ${groupName ?? groupId}`
  const members = read(context.collector, what, context.inputs.groupMembers.get(groupId))
  // Graph lists each member once, but paging can repeat one; draw a membership once.
  const seen = new Set<string>()
  for (const member of members ?? []) {
    if (seen.has(member.id)) continue
    seen.add(member.id)
    const principal = memberPrincipal(member)
    addPrincipal(context, principal)
    const effective = principal.kind === 'user'
    const reason = effective
      ? undefined
      : principal.kind === 'other'
        ? 'Not a user or app.'
        : NOT_EFFECTIVE
    context.edges.push({ kind: 'membership', groupId, memberId: member.id, effective, reason })
    if (principal.kind === 'servicePrincipal' || principal.kind === 'managedIdentity') {
      context.collector.findings.push({ kind: 'ineffective-member', groupId, memberId: member.id })
    }
  }
}

/** Adds the grant and membership edges of one operation, and its inbound findings. */
export function resolveInbound(context: MapperContext, policy: OperationPolicy): void {
  const { operationId } = policy
  const rules = policy.rules.filter(
    (rule): rule is JwtValidationRule => rule.kind === 'validate-jwt',
  )
  if (rules.length === 0) {
    context.collector.findings.push({ kind: 'no-auth', operationId })
    return
  }
  if (!context.inputs.entra) {
    // ARM only: what the policy requires is known, who meets it isn't. With no target service
    // principals, reportClaims raises only the findings the policy alone shows.
    for (const rule of rules) reportClaims(context, operationId, rule, [])
    return
  }
  // A caller must pass every validate-jwt; rules without a roles claim add no constraint.
  let callers: Map<string, { holder: Holder; roles: string[] }> | undefined
  let complete = true
  for (const rule of rules) {
    const ofRule = callersOfRule(context, operationId, rule)
    if (ofRule === undefined) {
      complete &&= !rule.requiredClaims.some((claim) => claim.name === ROLES_CLAIM)
      continue
    }
    callers = callers ? new Map([...callers].filter(([id]) => ofRule.has(id))) : ofRule
  }
  if (!complete || !callers) return
  for (const { holder, roles } of callers.values()) {
    addHolder(context, holder)
    context.edges.push({ kind: 'grant', principalId: holder.principalId, operationId, roles })
    if (holder.principalType === 'Group')
      addMembers(context, holder.principalId, holder.displayName)
  }
}
