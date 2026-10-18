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

type Replacement = readonly [pattern: RegExp, placeholder: string]

// maskText runs several times per request with the same IDs, so the patterns for the last IDs are
// kept instead of being compiled on every call.
let cached: { key: string; replacements: readonly Replacement[] } | undefined

function replacementsFor(values: MaskValues): readonly Replacement[] {
  const sub = values.subscriptionId?.trim() ?? ''
  const tid = values.tenantId?.trim() ?? ''
  const key = `${sub}\n${tid}`
  if (cached?.key !== key) {
    const pairs: [string, string][] = [
      [sub, '{sub}'],
      [tid, '{tid}'],
    ]
    const replacements = pairs.flatMap(([value, placeholder]): Replacement[] =>
      value ? [[new RegExp(escapeRegExp(value), 'gi'), placeholder]] : [],
    )
    cached = { key, replacements }
  }
  return cached.replacements
}

/** Forgets the cached IDs. Called on "Clear session" via `HttpClient.reset()`. */
export function clearMaskCache(): void {
  cached = undefined
}

/**
 * Masks the subscription and tenant IDs as `{sub}` / `{tid}`, and anything that looks like a JWT as `{token}`.
 * Every `/subscriptions/<guid>` segment is masked even when it isn't the selected subscription.
 */
export function maskText(text: string, values: MaskValues): string {
  let out = text.replace(JWT_LIKE, '{token}').replace(SUBSCRIPTION_SEGMENT, '$1{sub}')
  for (const [pattern, placeholder] of replacementsFor(values)) {
    out = out.replace(pattern, placeholder)
  }
  return out
}
