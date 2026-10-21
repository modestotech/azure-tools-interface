/**
 * Every ARM api-version the app uses, in one place. Backends are URL only, so there are no
 * per-provider versions for looking up the resource behind a backend.
 */

/**
 * Pinned GA api-version for Microsoft.ApiManagement.
 * 2024-05-01 is the newest folder under
 * azure-rest-api-specs/specification/apimanagement/resource-manager/Microsoft.ApiManagement/ApiManagement/stable
 * (verified 2026-10-14).
 */
export const APIM_API_VERSION = '2024-05-01'

/** Microsoft.Resources, used to list the subscriptions for the picker (`GET /subscriptions`). */
export const SUBSCRIPTIONS_API_VERSION = '2022-12-01'
