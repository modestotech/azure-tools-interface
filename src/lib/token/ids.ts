const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** A domain name such as `contoso.onmicrosoft.com`: dot-separated labels of letters, digits and hyphens. */
const DOMAIN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i

/** Subscription IDs are always GUIDs. */
export function isSubscriptionId(value: string): boolean {
  return GUID.test(value)
}

/**
 * A tenant is a GUID or one of its domain names. Anything else is rejected, so an entered value can
 * safely go into a URL or into the `az` command the user copies.
 */
export function isTenantId(value: string): boolean {
  return GUID.test(value) || DOMAIN.test(value)
}
