/** The two APIs the app talks to. A token is only valid for one of them. */
export type ApiKind = 'arm' | 'graph'

export interface ApiResource {
  /** Name shown in messages and the UI. */
  readonly label: string
  /** Value passed to `az account get-access-token --resource`. */
  readonly resource: string
  /** Origin every request URL for this API must have. */
  readonly origin: string
  /** Prefix for request URLs: the origin, plus the version path for Graph. */
  readonly baseUrl: string
  /** `aud` values Entra may put in a token for this resource. */
  readonly audiences: readonly string[]
}

export const API_RESOURCES: Readonly<Record<ApiKind, ApiResource>> = {
  arm: {
    label: 'ARM',
    resource: 'https://management.azure.com',
    origin: 'https://management.azure.com',
    baseUrl: 'https://management.azure.com',
    audiences: [
      'https://management.azure.com',
      'https://management.core.windows.net',
      // Application ID of Windows Azure Service Management API
      '797f4846-ba00-4fd7-ba43-dac1f8f63013',
    ],
  },
  graph: {
    label: 'Graph',
    resource: 'https://graph.microsoft.com',
    origin: 'https://graph.microsoft.com',
    baseUrl: 'https://graph.microsoft.com/v1.0',
    audiences: [
      'https://graph.microsoft.com',
      // Application ID of Microsoft Graph
      '00000003-0000-0000-c000-000000000000',
    ],
  },
}

export function isExpectedAudience(api: ApiKind, aud: string): boolean {
  const normalized = aud.replace(/\/+$/, '').toLowerCase()
  return API_RESOURCES[api].audiences.some((a) => a.toLowerCase() === normalized)
}

/** The command the user runs to get a fresh token. Contains no secrets. */
export function azTokenCommand(api: ApiKind, tenantId?: string): string {
  const tenant = tenantId?.trim() ? tenantId.trim() : '<TENANT_ID>'
  return `az account get-access-token --resource ${API_RESOURCES[api].resource} --tenant ${tenant} --query accessToken -o tsv`
}
