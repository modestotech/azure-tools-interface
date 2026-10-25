import type { GraphServicePrincipal } from '@/services/graph'
import type { OperationPolicy } from '../model'
import type { AccessModel } from './buildAccessModel'
import type { Loadable } from './inputs'

/**
 * What to fetch next, derived from what has loaded. `useAccessModel()` chains the query hooks
 * through these, so the waterfall (policies → audiences → role holders → group members) is decided
 * in the domain, not in the hook.
 */

const unique = <T>(values: Iterable<T>) => [...new Set(values)]

export interface PolicyLookups {
  /** `validate-jwt` audiences: each resolves to the API's service principal. */
  readonly audiences: readonly string[]
  /** `set-backend-service` backend IDs. */
  readonly backendIds: readonly string[]
  /** `authentication-managed-identity` resources: each resolves to the backend's service principal. */
  readonly resources: readonly string[]
}

export function policyLookups(policies: Iterable<OperationPolicy>): PolicyLookups {
  // An operation with an unreadable policy draws no conclusions, so nothing is fetched for it.
  const rules = [...policies]
    .filter((policy) => policy.unreadable.length === 0)
    .flatMap((policy) => policy.rules)
  return {
    audiences: unique(
      rules.flatMap((rule) => (rule.kind === 'validate-jwt' ? rule.audiences : [])),
    ),
    backendIds: unique(
      rules.flatMap((rule) => (rule.kind === 'set-backend-service' ? [rule.backendId] : [])),
    ),
    resources: unique(
      rules.flatMap((rule) =>
        rule.kind === 'authentication-managed-identity' ? [rule.resource] : [],
      ),
    ),
  }
}

/** The API service principals the audiences resolved to, for their role holders. */
export function audienceServicePrincipalIds(
  audiences: ReadonlyMap<string, Loadable<readonly GraphServicePrincipal[]>>,
): string[] {
  return unique(
    [...audiences.values()].flatMap((result) =>
      result?.status === 'ok' ? result.data.map((sp) => sp.id) : [],
    ),
  )
}

export interface ModelLookups {
  /** Role-holding apps and managed identities, for their appId and type. */
  readonly servicePrincipalIds: readonly string[]
  /** Role-holding groups, for their direct members. */
  readonly groupIds: readonly string[]
  /** APIM identities used for outbound auth, for the app roles they hold. */
  readonly identityPrincipalIds: readonly string[]
}

export function modelLookups(model: AccessModel): ModelLookups {
  const granted = unique(
    model.edges.flatMap((edge) => (edge.kind === 'grant' ? [edge.principalId] : [])),
  ).flatMap((id) => {
    const principal = model.principals.get(id)
    return principal ? [principal] : []
  })
  return {
    servicePrincipalIds: granted
      .filter((p) => p.kind === 'servicePrincipal' || p.kind === 'managedIdentity')
      .map((p) => p.id),
    groupIds: granted.filter((p) => p.kind === 'group').map((p) => p.id),
    identityPrincipalIds: unique(
      model.operations.flatMap(({ outbound }) =>
        outbound?.mechanism === 'ManagedIdentity' && outbound.principalId
          ? [outbound.principalId]
          : [],
      ),
    ),
  }
}
