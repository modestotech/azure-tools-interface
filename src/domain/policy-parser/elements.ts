import type { AccessRule, RequiredClaim, RuleSource, XmlElement } from '../model'
import { allValues, childNamed, childrenNamed, textOf } from './xmlTree'

/**
 * How each element in `inbound` / `backend` is handled. This table is the only place that decides
 * it: supported elements become rules, ignored ones don't affect access or routing, and everything
 * else (not listed, or a listed element used outside the pattern) is unresolved.
 */

/** An extractor returns a rule, or the reason the element is outside the supported pattern. */
type Extract = (element: XmlElement, source: RuleSource) => AccessRule | { unresolved: string }

type ElementEntry =
  | { readonly handling: 'supported'; readonly extract: Extract }
  | {
      readonly handling: 'ignored'
      readonly why: string
      readonly unless?: (element: XmlElement) => string | undefined
    }

/**
 * `@(...)`, `@{...}` and `{{named value}}` make a value depend on the request or on configuration
 * the app doesn't read, so an access or routing value containing one can't be resolved.
 */
const EXPRESSION = /@\(|@\{|\{\{/

const usesExpression = (values: readonly string[]) => values.some((value) => EXPRESSION.test(value))

const EXPRESSION_REASON =
  'Uses a policy expression or named value in an access or routing value; the app cannot resolve it.'

function extractJwt(element: XmlElement, source: RuleSource): AccessRule | { unresolved: string } {
  // The error message is shown to callers and may use expressions without affecting access.
  const { 'failed-validation-error-message': _message, ...accessAttributes } = element.attributes
  const accessValues = [
    ...Object.values(accessAttributes),
    ...element.children.flatMap((child) => ('name' in child ? allValues(child) : [child.text])),
  ]
  if (usesExpression(accessValues)) return { unresolved: EXPRESSION_REASON }

  const texts = (parent: string, child: string) => {
    const container = childNamed(element, parent)
    return container ? childrenNamed(container, child).map(textOf) : []
  }
  const requiredClaims: RequiredClaim[] = (() => {
    const container = childNamed(element, 'required-claims')
    return container
      ? childrenNamed(container, 'claim').map((claim) => ({
          name: claim.attributes.name ?? '',
          match: claim.attributes.match === 'any' ? 'any' : 'all',
          values: childrenNamed(claim, 'value').map(textOf),
        }))
      : []
  })()
  return {
    kind: 'validate-jwt',
    source,
    headerName: element.attributes['header-name'],
    openIdConfigUrls: childrenNamed(element, 'openid-config')
      .map((config) => config.attributes.url)
      .filter((url): url is string => url !== undefined),
    audiences: texts('audiences', 'audience'),
    issuers: texts('issuers', 'issuer'),
    requiredClaims,
  }
}

function extractBackend(
  element: XmlElement,
  source: RuleSource,
): AccessRule | { unresolved: string } {
  const { 'backend-id': backendId, 'base-url': baseUrl } = element.attributes
  if (baseUrl !== undefined)
    return { unresolved: 'Routes with base-url, which is outside the supported pattern.' }
  if (!backendId) return { unresolved: 'set-backend-service without backend-id.' }
  if (usesExpression([backendId])) return { unresolved: EXPRESSION_REASON }
  return { kind: 'set-backend-service', source, backendId }
}

function extractManagedIdentity(
  element: XmlElement,
  source: RuleSource,
): AccessRule | { unresolved: string } {
  const {
    resource,
    'client-id': clientId,
    'output-token-variable-name': variable,
  } = element.attributes
  if (!resource) return { unresolved: 'authentication-managed-identity without resource.' }
  if (variable !== undefined) {
    return {
      unresolved: 'Stores the token in a variable instead of sending it; check how it is used.',
    }
  }
  if (usesExpression([resource, clientId ?? ''])) return { unresolved: EXPRESSION_REASON }
  return { kind: 'authentication-managed-identity', source, resource, clientId }
}

const ELEMENTS: Readonly<Record<string, ElementEntry>> = {
  'validate-jwt': { handling: 'supported', extract: extractJwt },
  'set-backend-service': { handling: 'supported', extract: extractBackend },
  'authentication-managed-identity': { handling: 'supported', extract: extractManagedIdentity },
  base: { handling: 'ignored', why: 'Replaced by the parent scope during composition.' },
  cors: {
    handling: 'ignored',
    why: 'Browser cross-origin rules; not an access control for API callers.',
  },
  'rate-limit': { handling: 'ignored', why: 'Throttling only.' },
  'rate-limit-by-key': { handling: 'ignored', why: 'Throttling only.' },
  quota: { handling: 'ignored', why: 'Usage quota only.' },
  'quota-by-key': { handling: 'ignored', why: 'Usage quota only.' },
  'forward-request': {
    handling: 'ignored',
    why: 'Forwards the call to the backend chosen elsewhere; changes neither who nor where.',
  },
  'set-header': {
    handling: 'ignored',
    why: 'Header cleanup or enrichment.',
    unless: (element) =>
      element.attributes.name?.toLowerCase() === 'authorization'
        ? 'Sets the Authorization header, which may authenticate to the backend.'
        : undefined,
  },
}

export type ElementOutcome =
  | { readonly kind: 'rule'; readonly rule: AccessRule }
  | { readonly kind: 'ignored' }
  | { readonly kind: 'unresolved'; readonly reason: string }

/** Decides what one effective `inbound` / `backend` element means. */
export function classifyElement(element: XmlElement, source: RuleSource): ElementOutcome {
  const entry = ELEMENTS[element.name]
  if (!entry)
    return { kind: 'unresolved', reason: `<${element.name}> is outside the supported pattern.` }
  if (entry.handling === 'ignored') {
    const reason = entry.unless?.(element)
    return reason ? { kind: 'unresolved', reason } : { kind: 'ignored' }
  }
  const extracted = entry.extract(element, source)
  return 'unresolved' in extracted
    ? { kind: 'unresolved', reason: extracted.unresolved }
    : { kind: 'rule', rule: extracted }
}
