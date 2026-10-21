import { useQueries, useQuery } from '@tanstack/react-query'
import { queryKeys } from '../queryKeys'
import { resourceQuery, useHttpClient } from '../query'
import { getServicePrincipalsByIds } from './batch'
import {
  findServicePrincipalsByName,
  getGroup,
  getServicePrincipalByAppId,
  getServicePrincipalById,
  listAppRoleAssignedTo,
  listAppRoleAssignments,
  listGroupMembers,
} from './entra'

/**
 * One TanStack Query hook per Graph read. Each takes its inputs as possibly undefined and stays
 * idle until they're known (usually from an earlier ARM or Graph result). `data` is a
 * ResourceResult.
 */

export function useServicePrincipalByAppId(appId: string | undefined) {
  const client = useHttpClient()
  return useQuery(
    resourceQuery(appId, queryKeys.graph.spByAppId, (id, signal) =>
      getServicePrincipalByAppId(client, id, { signal }),
    ),
  )
}

export function useServicePrincipalById(id: string | undefined) {
  const client = useHttpClient()
  return useQuery(
    resourceQuery(id, queryKeys.graph.spById, (spId, signal) =>
      getServicePrincipalById(client, spId, { signal }),
    ),
  )
}

export function useServicePrincipalsByName(name: string | undefined) {
  const client = useHttpClient()
  return useQuery(
    resourceQuery(name, queryKeys.graph.spByName, (spName, signal) =>
      findServicePrincipalsByName(client, spName, { signal }),
    ),
  )
}

/** Bulk lookup through `$batch`. Idle while `ids` is undefined; an empty list sends nothing. */
export function useServicePrincipalsByIds(ids: readonly string[] | undefined) {
  const client = useHttpClient()
  return useQuery(
    resourceQuery(ids, queryKeys.graph.spsByIds, (spIds, signal) =>
      getServicePrincipalsByIds(client, spIds, { signal }),
    ),
  )
}

export function useAppRoleAssignedTo(spId: string | undefined) {
  const client = useHttpClient()
  return useQuery(
    resourceQuery(spId, queryKeys.graph.appRoleAssignedTo, (id, signal) =>
      listAppRoleAssignedTo(client, id, { signal }),
    ),
  )
}

export function useAppRoleAssignments(spId: string | undefined) {
  const client = useHttpClient()
  return useQuery(
    resourceQuery(spId, queryKeys.graph.appRoleAssignments, (id, signal) =>
      listAppRoleAssignments(client, id, { signal }),
    ),
  )
}

/** Groups and their direct members, one query each per group. */
export function useGroups(groupIds: readonly string[]) {
  const client = useHttpClient()
  return useQueries({
    queries: groupIds.map((groupId) =>
      resourceQuery(groupId, queryKeys.graph.group, (id, signal) =>
        getGroup(client, id, { signal }),
      ),
    ),
  })
}

export function useGroupMembers(groupIds: readonly string[]) {
  const client = useHttpClient()
  return useQueries({
    queries: groupIds.map((groupId) =>
      resourceQuery(groupId, queryKeys.graph.groupMembers, (id, signal) =>
        listGroupMembers(client, id, { signal }),
      ),
    ),
  })
}
