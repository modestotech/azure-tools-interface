import type {
  AccessRule,
  Api,
  AppRole,
  BackendBinding,
  BackendRule,
  ManagedIdentityAuthRule,
  OperationPolicy,
  OutboundAuth,
} from '../model'
import type { MapperContext } from './context'
import { read } from './inputs'
import { backendKey, serviceUrlBackend, toAppRole, toBackend } from './normalize'

/**
 * Outbound: where each operation goes and how APIM authenticates there. The last
 * `set-backend-service` wins; without one the API's serviceUrl applies. The last
 * `authentication-managed-identity` sets the Authorization header APIM sends.
 */

function lastOf<K extends AccessRule['kind']>(rules: readonly AccessRule[], kind: K) {
  return rules.findLast((rule): rule is Extract<AccessRule, { kind: K }> => rule.kind === kind)
}

function checkUrl(
  context: MapperContext,
  operationId: string,
  key: string,
  url: string | undefined,
) {
  const { findings } = context.collector
  if (!url) findings.push({ kind: 'no-backend-url', operationId, backendKey: key })
  else if (url.toLowerCase().startsWith('http://')) {
    findings.push({ kind: 'http-backend', operationId, backendKey: key })
  }
}

function bindBackend(
  context: MapperContext,
  api: Api,
  operationId: string,
  rule: BackendRule | undefined,
): BackendBinding {
  if (!rule) {
    const backend = serviceUrlBackend(api)
    context.backends.set(backend.key, backend)
    checkUrl(context, operationId, backend.key, backend.url)
    return { operationId, backendKey: backend.key, source: undefined }
  }
  const key = backendKey(rule.backendId)
  const what = `backend ${rule.backendId}`
  const loaded = read(context.collector, what, context.inputs.backends.get(rule.backendId))
  if (loaded === null) {
    context.collector.findings.push({
      kind: 'backend-not-found',
      operationId,
      backendId: rule.backendId,
    })
  } else if (loaded) {
    const backend = toBackend(loaded)
    context.backends.set(key, backend)
    checkUrl(context, operationId, key, backend.url)
  }
  return { operationId, backendKey: key, source: rule.source }
}

/** The identity's principal ID: the user-assigned one with this client ID, or the system-assigned one. */
function identityPrincipalId(
  context: MapperContext,
  operationId: string,
  clientId: string | undefined,
): string | undefined {
  const service = read(context.collector, 'APIM service', context.inputs.service)
  if (!service) return undefined
  if (clientId === undefined) {
    const principalId = service.identity?.systemAssignedPrincipalId
    if (!principalId) context.collector.findings.push({ kind: 'no-system-identity', operationId })
    return principalId
  }
  const match = service.identity?.userAssigned.find(
    (identity) => identity.clientId.toLowerCase() === clientId.toLowerCase(),
  )
  if (!match) context.collector.findings.push({ kind: 'identity-not-found', operationId, clientId })
  return match?.principalId
}

function managedIdentityAuth(
  context: MapperContext,
  operationId: string,
  rule: ManagedIdentityAuthRule,
): OutboundAuth {
  const { collector, inputs } = context
  const { resource, clientId, source } = rule
  const principalId = identityPrincipalId(context, operationId, clientId)
  // ARM only: which identity APIM uses comes from ARM; its target and roles there need Entra.
  if (!inputs.entra) {
    return {
      mechanism: 'ManagedIdentity',
      source,
      clientId,
      principalId,
      resource,
      targetIds: [],
      roles: [],
    }
  }
  const what = `service principal for resource ${resource}`
  const targets = read(collector, what, inputs.resources.get(resource))
  if (targets === null || targets?.length === 0) {
    collector.findings.push({ kind: 'resource-not-found', operationId, resource })
  }
  const roles: AppRole[] = []
  if (principalId && targets && targets.length > 0) {
    const held = read(
      collector,
      "APIM identity's app roles",
      inputs.identityAssignments.get(principalId),
    )
    if (held !== undefined) {
      for (const assignment of held ?? []) {
        const target = targets.find((sp) => sp.id === assignment.resourceId)
        const role = target?.appRoles.find((appRole) => appRole.id === assignment.appRoleId)
        if (role) roles.push(toAppRole(role))
      }
      if (roles.length === 0)
        collector.findings.push({ kind: 'identity-has-no-role', operationId, resource })
    }
  }
  const targetIds = (targets ?? []).map((sp) => sp.id)
  return { mechanism: 'ManagedIdentity', source, clientId, principalId, resource, targetIds, roles }
}

/** The backend binding, route edge and outbound auth of one operation, with their findings. */
export function resolveOutbound(
  context: MapperContext,
  api: Api,
  policy: OperationPolicy,
): { backend: BackendBinding; outbound: OutboundAuth } {
  const { operationId, rules } = policy
  const backend = bindBackend(context, api, operationId, lastOf(rules, 'set-backend-service'))
  context.edges.push({ kind: 'route', operationId, backendKey: backend.backendKey })
  const authRule = lastOf(rules, 'authentication-managed-identity')
  if (!authRule) {
    context.collector.findings.push({ kind: 'no-outbound-auth', operationId })
    return { backend, outbound: { mechanism: 'None' } }
  }
  return { backend, outbound: managedIdentityAuth(context, operationId, authRule) }
}
