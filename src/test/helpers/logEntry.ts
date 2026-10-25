import type { RequestLogEntry } from '@/lib/http'
import { APIM_API_VERSION } from '@/services/arm/apiVersion'
import { ARM } from '@/test/msw/handlers'

/** A masked APIM service URL. */
export const LOG_SERVICE_URL = `${ARM}/subscriptions/{sub}/resourceGroups/rg/providers/Microsoft.ApiManagement/service/apim`

/** A finished ARM request for the request log tests; `patch` overrides any field. */
export function logEntry(patch: Partial<RequestLogEntry> = {}): RequestLogEntry {
  return {
    id: 1,
    api: 'arm',
    method: 'GET',
    url: `${LOG_SERVICE_URL}/apis?api-version=${APIM_API_VERSION}`,
    rawUrl: `${LOG_SERVICE_URL}/apis?api-version=${APIM_API_VERSION}`,
    label: undefined,
    queryKey: undefined,
    state: 'ok',
    status: 200,
    startedAt: 0,
    durationMs: 143,
    bytes: 4200,
    retries: 0,
    error: undefined,
    errorKind: undefined,
    ...patch,
  }
}
