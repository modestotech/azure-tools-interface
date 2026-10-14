export interface MaskValues {
  readonly subscriptionId?: string | undefined
  readonly tenantId?: string | undefined
}

const GUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const SUBSCRIPTION_SEGMENT = new RegExp(`(/subscriptions/)${GUID}`, 'gi')
const JWT_LIKE = /eyJ[\w-]+\.[\w-]+\.[\w-]*/g

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Masks the subscription and tenant IDs as `{sub}` / `{tid}`, and anything that looks like a JWT as `{token}`.
 * Every `/subscriptions/<guid>` segment is masked even when it isn't the selected subscription.
 */
export function maskText(text: string, values: MaskValues): string {
  let out = text.replace(JWT_LIKE, '{token}').replace(SUBSCRIPTION_SEGMENT, '$1{sub}')
  const pairs: [string | undefined, string][] = [
    [values.subscriptionId, '{sub}'],
    [values.tenantId, '{tid}'],
  ]
  for (const [value, placeholder] of pairs) {
    const v = value?.trim()
    if (v) out = out.replace(new RegExp(escapeRegExp(v), 'gi'), placeholder)
  }
  return out
}
