import { encodePathSegment, HttpError, withQuery } from '@/lib/http'
import { API_RESOURCES, isSubscriptionId } from '@/lib/token'
import { APIM_API_VERSION, SUBSCRIPTIONS_API_VERSION } from './apiVersion'

/**
 * ARM request URLs. Every ID in a path goes through `encodePathSegment`, including the parts of a
 * service resource ID, so a value from ARM or from policy XML can't change which resource is read.
 */

const ARM = API_RESOURCES.arm.baseUrl

const SERVICE_ID =
  /^\/subscriptions\/([^/]+)\/resourceGroups\/([^/]+)\/providers\/Microsoft\.ApiManagement\/service\/([^/]+)$/i

/** An APIM service, from its ARM resource ID. */
export interface ApimServiceRef {
  /** The resource ID as ARM returned it. Query keys use it. */
  readonly id: string
  readonly subscriptionId: string
  readonly resourceGroup: string
  readonly name: string
}

/** Splits an APIM service resource ID into its parts; throws `invalid-request` for anything else. */
export function parseApimServiceId(id: string): ApimServiceRef {
  const [, subscriptionId, resourceGroup, name] = SERVICE_ID.exec(id) ?? []
  if (!subscriptionId || !resourceGroup || !name || !isSubscriptionId(subscriptionId)) {
    throw new HttpError('invalid-request', 'arm', 'Not an API Management service resource ID.')
  }
  return { id, subscriptionId, resourceGroup, name }
}

const segment = (value: string) => encodePathSegment('arm', value)

const apim = (path: string, query: Readonly<Record<string, string>> = {}) =>
  withQuery(`${ARM}${path}`, { 'api-version': APIM_API_VERSION, ...query })

const RAW_XML = { format: 'rawxml' }

function servicePath(svc: ApimServiceRef): string {
  return `/subscriptions/${segment(svc.subscriptionId)}/resourceGroups/${segment(svc.resourceGroup)}/providers/Microsoft.ApiManagement/service/${segment(svc.name)}`
}

function apiPath(svc: ApimServiceRef, apiId: string): string {
  return `${servicePath(svc)}/apis/${segment(apiId)}`
}

export const armUrls = {
  subscriptions: () =>
    withQuery(`${ARM}/subscriptions`, { 'api-version': SUBSCRIPTIONS_API_VERSION }),
  services: (subscriptionId: string) =>
    apim(`/subscriptions/${segment(subscriptionId)}/providers/Microsoft.ApiManagement/service`),
  service: (svc: ApimServiceRef) => apim(servicePath(svc)),
  apis: (svc: ApimServiceRef) => apim(`${servicePath(svc)}/apis`),
  operations: (svc: ApimServiceRef, apiId: string) => apim(`${apiPath(svc, apiId)}/operations`),
  globalPolicy: (svc: ApimServiceRef) => apim(`${servicePath(svc)}/policies/policy`, RAW_XML),
  apiPolicy: (svc: ApimServiceRef, apiId: string) =>
    apim(`${apiPath(svc, apiId)}/policies/policy`, RAW_XML),
  operationPolicy: (svc: ApimServiceRef, apiId: string, opId: string) =>
    apim(`${apiPath(svc, apiId)}/operations/${segment(opId)}/policies/policy`, RAW_XML),
  backend: (svc: ApimServiceRef, backendId: string) =>
    apim(`${servicePath(svc)}/backends/${segment(backendId)}`),
}
