import type { ArmApi, ArmApimService, ArmBackend, ArmOperation } from '@/services/arm'
import type { GraphAppRole, GraphDirectMember, GraphServicePrincipal } from '@/services/graph'
import type { Api, ApimService, AppRole, Backend, Operation, Principal } from '../model'

/** Service records → domain types. The only place that knows both shapes. */

export function toApi(api: ArmApi): Api {
  return { id: api.name, displayName: api.displayName, path: api.path, serviceUrl: api.serviceUrl }
}

export function toOperation(operation: ArmOperation): Operation {
  const { name, displayName, method, urlTemplate } = operation
  return { id: name, displayName, method, urlTemplate }
}

export function toApimService(service: ArmApimService): ApimService {
  return {
    id: service.id,
    name: service.name,
    userAssignedIdentities: service.identity?.userAssigned ?? [],
  }
}

export function toAppRole(role: GraphAppRole): AppRole {
  return {
    id: role.id,
    value: role.value,
    displayName: role.displayName,
    isEnabled: role.isEnabled,
  }
}

export const backendKey = (backendId: string) => `backend:${backendId}`
export const SERVICE_URL_KEY = 'service-url'

export function toBackend(backend: ArmBackend): Backend {
  return {
    key: backendKey(backend.name),
    backendId: backend.name,
    title: backend.title,
    url: backend.url,
    protocol: backend.protocol,
    type: backend.type,
    tls: backend.tls,
    credentialMechanisms: backend.credentialMechanisms,
  }
}

/** The API's serviceUrl as a backend: used when no policy sets one. */
export function serviceUrlBackend(api: Api): Backend {
  return {
    key: SERVICE_URL_KEY,
    backendId: undefined,
    title: `${api.displayName} service URL`,
    url: api.serviceUrl,
    protocol: undefined,
    type: 'ApiServiceUrl',
    tls: { validateCertificateChain: undefined, validateCertificateName: undefined },
    credentialMechanisms: [],
  }
}

/** A service principal as a principal: a managed identity or an app. */
export function servicePrincipalPrincipal(sp: GraphServicePrincipal): Principal {
  const kind =
    sp.servicePrincipalType === 'ManagedIdentity' ? 'managedIdentity' : 'servicePrincipal'
  return { kind, id: sp.id, appId: sp.appId, displayName: sp.displayName }
}

export function memberPrincipal(member: GraphDirectMember): Principal {
  switch (member.kind) {
    case 'user':
      return {
        kind: 'user',
        id: member.id,
        displayName: member.displayName,
        userPrincipalName: member.userPrincipalName,
      }
    case 'servicePrincipal': {
      const kind =
        member.servicePrincipalType === 'ManagedIdentity' ? 'managedIdentity' : 'servicePrincipal'
      return { kind, id: member.id, appId: member.appId, displayName: member.displayName }
    }
    case 'other':
      return { kind: 'other', id: member.id, displayName: member.displayName }
  }
}
