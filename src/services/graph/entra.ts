import type { HttpClient } from '@/lib/http'
import { isGuid } from '@/lib/token'
import { queryKeys } from '../queryKeys'
import { settle, type ResourceResult } from '../result'
import {
  appRoleAssignmentSchema,
  groupMemberSchema,
  groupSchema,
  servicePrincipalSchema,
  type GraphAppRoleAssignment,
  type GraphDirectMember,
  type GraphGroup,
  type GraphGroupMember,
  type GraphServicePrincipal,
} from './schemas'
import { graphPaths, graphUrl } from './urls'

/**
 * Microsoft Graph reads for the inbound (who may call the API) and outbound (what APIM's identity
 * holds) joins. Each returns a ResourceResult, so a forbidden Graph call never blocks the APIM view.
 */

export interface LoadOptions {
  signal?: AbortSignal | undefined
}

/** The API's service principal, from a GUID `validate-jwt` audience. `empty` if none exists. */
export function getServicePrincipalByAppId(
  client: HttpClient,
  appId: string,
  options: LoadOptions = {},
): Promise<ResourceResult<GraphServicePrincipal>> {
  return settle(() =>
    client.getJson('graph', graphUrl(graphPaths.servicePrincipalByAppId(appId)), {
      ...options,
      queryKey: queryKeys.graph.spByAppId(appId),
      schema: servicePrincipalSchema,
    }),
  )
}

/** A service principal by object ID, e.g. APIM's user-assigned identity from its `principalId`. */
export function getServicePrincipalById(
  client: HttpClient,
  id: string,
  options: LoadOptions = {},
): Promise<ResourceResult<GraphServicePrincipal>> {
  return settle(() =>
    client.getJson('graph', graphUrl(graphPaths.servicePrincipalById(id)), {
      ...options,
      queryKey: queryKeys.graph.spById(id),
      schema: servicePrincipalSchema,
    }),
  )
}

/**
 * Service principals that have `name` among their `servicePrincipalNames`: an `api://…` audience
 * or an `authentication-managed-identity` resource. Normally one; the caller decides what zero or
 * several mean.
 */
export function findServicePrincipalsByName(
  client: HttpClient,
  name: string,
  options: LoadOptions = {},
): Promise<ResourceResult<GraphServicePrincipal[]>> {
  return settle(() =>
    client.getAllPages('graph', graphUrl(graphPaths.servicePrincipalsByName(name)), {
      ...options,
      queryKey: queryKeys.graph.spByName(name),
      schema: servicePrincipalSchema,
    }),
  )
}

/**
 * The service principals a `validate-jwt` audience or an `authentication-managed-identity`
 * resource stands for: a GUID is an application ID, anything else (`api://…`, a URL) is matched
 * against `servicePrincipalNames`. Always a list; `empty` or `[]` means none.
 */
export function findServicePrincipalsForAudience(
  client: HttpClient,
  audience: string,
  options: LoadOptions = {},
): Promise<ResourceResult<GraphServicePrincipal[]>> {
  const queryKey = queryKeys.graph.spsForAudience(audience)
  if (!isGuid(audience)) {
    return settle(() =>
      client.getAllPages('graph', graphUrl(graphPaths.servicePrincipalsByName(audience)), {
        ...options,
        queryKey,
        schema: servicePrincipalSchema,
      }),
    )
  }
  return settle(async () => {
    const sp = await client.getJsonOrNull(
      'graph',
      graphUrl(graphPaths.servicePrincipalByAppId(audience)),
      { ...options, queryKey, schema: servicePrincipalSchema },
    )
    return sp ? [sp] : []
  })
}

/** Users, groups and service principals holding app roles on the API's service principal. */
export function listAppRoleAssignedTo(
  client: HttpClient,
  spId: string,
  options: LoadOptions = {},
): Promise<ResourceResult<GraphAppRoleAssignment[]>> {
  return settle(() =>
    client.getAllPages('graph', graphUrl(graphPaths.appRoleAssignedTo(spId)), {
      ...options,
      queryKey: queryKeys.graph.appRoleAssignedTo(spId),
      schema: appRoleAssignmentSchema,
    }),
  )
}

/** App roles a service principal (APIM's managed identity) holds on other service principals. */
export function listAppRoleAssignments(
  client: HttpClient,
  spId: string,
  options: LoadOptions = {},
): Promise<ResourceResult<GraphAppRoleAssignment[]>> {
  return settle(() =>
    client.getAllPages('graph', graphUrl(graphPaths.appRoleAssignments(spId)), {
      ...options,
      queryKey: queryKeys.graph.appRoleAssignments(spId),
      schema: appRoleAssignmentSchema,
    }),
  )
}

export function getGroup(
  client: HttpClient,
  groupId: string,
  options: LoadOptions = {},
): Promise<ResourceResult<GraphGroup>> {
  return settle(() =>
    client.getJson('graph', graphUrl(graphPaths.group(groupId)), {
      ...options,
      queryKey: queryKeys.graph.group(groupId),
      schema: groupSchema,
    }),
  )
}

/** Drops nested groups: their members don't receive roles assigned to the parent group. */
export function directMembers(members: readonly GraphGroupMember[]): GraphDirectMember[] {
  return members.filter((member): member is GraphDirectMember => member.kind !== 'group')
}

/** A group's direct members, nested groups removed. Never `transitiveMembers`. */
export function listGroupMembers(
  client: HttpClient,
  groupId: string,
  options: LoadOptions = {},
): Promise<ResourceResult<GraphDirectMember[]>> {
  return settle(async () => {
    const members = await client.getAllPages('graph', graphUrl(graphPaths.groupMembers(groupId)), {
      ...options,
      queryKey: queryKeys.graph.groupMembers(groupId),
      schema: groupMemberSchema,
    })
    return directMembers(members)
  })
}
