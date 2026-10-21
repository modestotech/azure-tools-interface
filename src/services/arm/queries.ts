import { useQueries, useQuery } from '@tanstack/react-query'
import { queryKeys } from '../queryKeys'
import { resourceQuery, useHttpClient } from '../query'
import {
  getApimService,
  getApiPolicy,
  getBackend,
  getGlobalPolicy,
  getOperationPolicy,
  listApimServices,
  listApis,
  listOperations,
  listSubscriptions,
} from './apim'
import type { ApimServiceRef } from './urls'

/**
 * One TanStack Query hook per ARM read. Each takes its inputs as possibly undefined and stays idle
 * until they're chosen. `data` is a ResourceResult.
 */

interface ApiInput {
  svc: ApimServiceRef
  apiId: string
}

const apiInput = (svc: ApimServiceRef | undefined, apiId: string | undefined) =>
  svc && apiId ? { svc, apiId } : undefined

export function useSubscriptions() {
  const client = useHttpClient()
  return useQuery(
    resourceQuery(
      {},
      () => queryKeys.arm.subscriptions(),
      (_, signal) => listSubscriptions(client, { signal }),
    ),
  )
}

export function useApimServices(subscriptionId: string | undefined) {
  const client = useHttpClient()
  return useQuery(
    resourceQuery(subscriptionId, queryKeys.arm.services, (sub, signal) =>
      listApimServices(client, sub, { signal }),
    ),
  )
}

export function useApis(svc: ApimServiceRef | undefined) {
  const client = useHttpClient()
  return useQuery(
    resourceQuery(
      svc,
      (s) => queryKeys.arm.apis(s.subscriptionId, s.id),
      (s, signal) => listApis(client, s, { signal }),
    ),
  )
}

export function useApimService(svc: ApimServiceRef | undefined) {
  const client = useHttpClient()
  return useQuery(
    resourceQuery(
      svc,
      (s) => queryKeys.arm.service(s.subscriptionId, s.id),
      (s, signal) => getApimService(client, s, { signal }),
    ),
  )
}

export function useGlobalPolicy(svc: ApimServiceRef | undefined) {
  const client = useHttpClient()
  return useQuery(
    resourceQuery(
      svc,
      (s) => queryKeys.arm.globalPolicy(s.subscriptionId, s.id),
      (s, signal) => getGlobalPolicy(client, s, { signal }),
    ),
  )
}

export function useOperations(svc: ApimServiceRef | undefined, apiId: string | undefined) {
  const client = useHttpClient()
  return useQuery(
    resourceQuery(
      apiInput(svc, apiId),
      (a: ApiInput) => queryKeys.arm.operations(a.svc.subscriptionId, a.svc.id, a.apiId),
      (a, signal) => listOperations(client, a.svc, a.apiId, { signal }),
    ),
  )
}

export function useApiPolicy(svc: ApimServiceRef | undefined, apiId: string | undefined) {
  const client = useHttpClient()
  return useQuery(
    resourceQuery(
      apiInput(svc, apiId),
      (a: ApiInput) => queryKeys.arm.apiPolicy(a.svc.subscriptionId, a.svc.id, a.apiId),
      (a, signal) => getApiPolicy(client, a.svc, a.apiId, { signal }),
    ),
  )
}

/** Each operation's own policy, one query per operation (the client limits concurrency). */
export function useOperationPolicies(
  svc: ApimServiceRef | undefined,
  apiId: string | undefined,
  opIds: readonly string[],
) {
  const client = useHttpClient()
  const api = apiInput(svc, apiId)
  return useQueries({
    queries: opIds.map((opId) =>
      resourceQuery(
        api && { ...api, opId },
        (o) => queryKeys.arm.operationPolicy(o.svc.subscriptionId, o.svc.id, o.apiId, o.opId),
        (o, signal) => getOperationPolicy(client, o.svc, o.apiId, o.opId, { signal }),
      ),
    ),
  })
}

/** Each backend named in the API's policies. */
export function useBackends(svc: ApimServiceRef | undefined, backendIds: readonly string[]) {
  const client = useHttpClient()
  return useQueries({
    queries: backendIds.map((backendId) =>
      resourceQuery(
        svc && { svc, backendId },
        (b) => queryKeys.arm.backend(b.svc.subscriptionId, b.svc.id, b.backendId),
        (b, signal) => getBackend(client, b.svc, b.backendId, { signal }),
      ),
    ),
  })
}
