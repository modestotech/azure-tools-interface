import type { HttpClient } from '@/lib/http'
import { queryKeys } from '../queryKeys'
import { settle, type ResourceResult } from '../result'
import {
  apiSchema,
  apimServiceSchema,
  backendSchema,
  operationSchema,
  policySchema,
  subscriptionSchema,
  type ArmApi,
  type ArmApimService,
  type ArmBackend,
  type ArmOperation,
  type ArmSubscription,
} from './schemas'
import { armUrls, type ApimServiceRef } from './urls'

/**
 * ARM reads for the pickers and for the one selected API. Each returns a ResourceResult, so a
 * failing resource never fails the others.
 */

export interface LoadOptions {
  signal?: AbortSignal | undefined
}

// Picker data

export function listSubscriptions(
  client: HttpClient,
  options: LoadOptions = {},
): Promise<ResourceResult<ArmSubscription[]>> {
  return settle(() =>
    client.getAllPages('arm', armUrls.subscriptions(), {
      ...options,
      queryKey: queryKeys.arm.subscriptions(),
      schema: subscriptionSchema,
    }),
  )
}

export function listApimServices(
  client: HttpClient,
  subscriptionId: string,
  options: LoadOptions = {},
): Promise<ResourceResult<ArmApimService[]>> {
  return settle(() =>
    client.getAllPages('arm', armUrls.services(subscriptionId), {
      ...options,
      queryKey: queryKeys.arm.services(subscriptionId),
      schema: apimServiceSchema,
    }),
  )
}

/** All APIs of a service: names and `serviceUrl` only, no per-API calls. */
export function listApis(
  client: HttpClient,
  svc: ApimServiceRef,
  options: LoadOptions = {},
): Promise<ResourceResult<ArmApi[]>> {
  return settle(() =>
    client.getAllPages('arm', armUrls.apis(svc), {
      ...options,
      queryKey: queryKeys.arm.apis(svc.subscriptionId, svc.id),
      schema: apiSchema,
    }),
  )
}

// Instance-wide reads the analysis needs

/** The service itself, for its managed identities. */
export function getApimService(
  client: HttpClient,
  svc: ApimServiceRef,
  options: LoadOptions = {},
): Promise<ResourceResult<ArmApimService>> {
  return settle(() =>
    client.getJson('arm', armUrls.service(svc), {
      ...options,
      queryKey: queryKeys.arm.service(svc.subscriptionId, svc.id),
      schema: apimServiceSchema,
    }),
  )
}

/** The global policy XML; `empty` when the service has none. */
export function getGlobalPolicy(
  client: HttpClient,
  svc: ApimServiceRef,
  options: LoadOptions = {},
): Promise<ResourceResult<string>> {
  return settle(() =>
    client.getJsonOrNull('arm', armUrls.globalPolicy(svc), {
      ...options,
      queryKey: queryKeys.arm.globalPolicy(svc.subscriptionId, svc.id),
      schema: policySchema,
    }),
  )
}

// The selected API

export function listOperations(
  client: HttpClient,
  svc: ApimServiceRef,
  apiId: string,
  options: LoadOptions = {},
): Promise<ResourceResult<ArmOperation[]>> {
  return settle(() =>
    client.getAllPages('arm', armUrls.operations(svc, apiId), {
      ...options,
      queryKey: queryKeys.arm.operations(svc.subscriptionId, svc.id, apiId),
      schema: operationSchema,
    }),
  )
}

/** The API-scope policy XML; `empty` when the API has none. */
export function getApiPolicy(
  client: HttpClient,
  svc: ApimServiceRef,
  apiId: string,
  options: LoadOptions = {},
): Promise<ResourceResult<string>> {
  return settle(() =>
    client.getJsonOrNull('arm', armUrls.apiPolicy(svc, apiId), {
      ...options,
      queryKey: queryKeys.arm.apiPolicy(svc.subscriptionId, svc.id, apiId),
      schema: policySchema,
    }),
  )
}

/** An operation's own policy XML; `empty` when it has none (the usual case). */
export function getOperationPolicy(
  client: HttpClient,
  svc: ApimServiceRef,
  apiId: string,
  opId: string,
  options: LoadOptions = {},
): Promise<ResourceResult<string>> {
  return settle(() =>
    client.getJsonOrNull('arm', armUrls.operationPolicy(svc, apiId, opId), {
      ...options,
      queryKey: queryKeys.arm.operationPolicy(svc.subscriptionId, svc.id, apiId, opId),
      schema: policySchema,
    }),
  )
}

/**
 * A backend named by `set-backend-service backend-id`. The ID comes from policy XML, so one that
 * isn't a plain path segment is refused (`invalid-request`) before anything is sent.
 */
export function getBackend(
  client: HttpClient,
  svc: ApimServiceRef,
  backendId: string,
  options: LoadOptions = {},
): Promise<ResourceResult<ArmBackend>> {
  return settle(() =>
    client.getJson('arm', armUrls.backend(svc, backendId), {
      ...options,
      queryKey: queryKeys.arm.backend(svc.subscriptionId, svc.id, backendId),
      schema: backendSchema,
    }),
  )
}
