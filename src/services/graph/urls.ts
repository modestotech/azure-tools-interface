import { encodePathSegment, HttpError, odataString, withQuery } from '@/lib/http'
import { API_RESOURCES, isGuid } from '@/lib/token'

/**
 * Microsoft Graph request paths, relative to `/v1.0` so they also work as `$batch` sub-requests.
 * IDs go through `encodePathSegment`; `$filter` values from policy XML go through `odataString`.
 */

/** Absolute URL for a path from `graphPaths`. */
export function graphUrl(path: string): string {
  return `${API_RESOURCES.graph.baseUrl}${path}`
}

const segment = (value: string) => encodePathSegment('graph', value)

const SERVICE_PRINCIPAL_FIELDS = [
  'id',
  'appId',
  'displayName',
  'servicePrincipalType',
  'servicePrincipalNames',
  'appRoles',
].join(',')

const ASSIGNMENT_FIELDS = [
  'id',
  'appRoleId',
  'principalId',
  'principalType',
  'principalDisplayName',
  'resourceId',
  'resourceDisplayName',
].join(',')

const GROUP_FIELDS = ['id', 'displayName', 'description', 'securityEnabled', 'groupTypes'].join(',')

const select = (path: string, fields: string) => withQuery(path, { $select: fields })

export const graphPaths = {
  /** Key lookup by application ID. The ID sits inside `(appId='…')`, so only a GUID is accepted. */
  servicePrincipalByAppId: (appId: string) => {
    if (!isGuid(appId)) {
      throw new HttpError(
        'invalid-request',
        'graph',
        'Refused an application ID that is not a GUID.',
      )
    }
    return select(`/servicePrincipals(appId='${appId}')`, SERVICE_PRINCIPAL_FIELDS)
  },
  servicePrincipalById: (id: string) =>
    select(`/servicePrincipals/${segment(id)}`, SERVICE_PRINCIPAL_FIELDS),
  /** Service principals with `name` among their `servicePrincipalNames`, e.g. an `api://…` audience. */
  servicePrincipalsByName: (name: string) =>
    withQuery('/servicePrincipals', {
      $filter: `servicePrincipalNames/any(x:x eq ${odataString(name)})`,
      $select: SERVICE_PRINCIPAL_FIELDS,
    }),
  /** Who holds app roles on this service principal (inbound). */
  appRoleAssignedTo: (spId: string) =>
    select(`/servicePrincipals/${segment(spId)}/appRoleAssignedTo`, ASSIGNMENT_FIELDS),
  /** App roles this service principal holds on others (outbound). */
  appRoleAssignments: (spId: string) =>
    select(`/servicePrincipals/${segment(spId)}/appRoleAssignments`, ASSIGNMENT_FIELDS),
  group: (groupId: string) => select(`/groups/${segment(groupId)}`, GROUP_FIELDS),
  /**
   * Direct members only, never `transitiveMembers`. No `$select`: members are users, service
   * principals, groups and devices, and the fields we need differ per type.
   */
  groupMembers: (groupId: string) => `/groups/${segment(groupId)}/members`,
}
