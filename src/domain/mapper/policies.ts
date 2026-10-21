import type { HttpError } from '@/lib/http'
import type { OperationPolicy, PolicyDocument, PolicyScope } from '../model'
import { analyzeOperationPolicy, parsePolicyDocument } from '../policy-parser'
import { newCollector, type Collector, type Loadable } from './inputs'

/**
 * A loaded policy as a document: `undefined` for "no policy at this scope", `'loading'` while it
 * loads. A policy that failed to load becomes an unreadable document, so the operation gets an
 * unresolved rule instead of silently missing its rules.
 */
function documentFor(
  collector: Collector,
  what: string,
  scope: PolicyScope,
  loadable: Loadable<string>,
  operationId?: string,
): PolicyDocument | undefined | 'loading' {
  if (loadable === undefined) {
    collector.pending.add(what)
    return 'loading'
  }
  switch (loadable.status) {
    case 'ok':
      return parsePolicyDocument(scope, loadable.data, operationId)
    case 'empty':
      return undefined
    default:
      return failedDocument(collector, what, scope, loadable.status, loadable.error, operationId)
  }
}

function failedDocument(
  collector: Collector,
  what: string,
  scope: PolicyScope,
  status: 'forbidden' | 'error',
  error: HttpError,
  operationId: string | undefined,
): PolicyDocument {
  collector.problems.push({ what, status, error })
  const parsed = { ok: false as const, error: `it could not be loaded (${error.kind})` }
  return { scope, operationId, xml: '', parsed }
}

/**
 * The effective policy of each operation whose global, API and operation policies have loaded,
 * keyed by operation ID. Operations still waiting for a policy are left out.
 */
export function analyzePolicies(
  collector: Collector,
  operationIds: readonly string[],
  globalPolicy: Loadable<string>,
  apiPolicy: Loadable<string>,
  operationPolicies: ReadonlyMap<string, Loadable<string>>,
): Map<string, OperationPolicy> {
  const global = documentFor(collector, 'global policy', 'global', globalPolicy)
  const api = documentFor(collector, 'API policy', 'api', apiPolicy)
  const policies = new Map<string, OperationPolicy>()
  if (global === 'loading' || api === 'loading') return policies
  for (const operationId of operationIds) {
    const what = `policy of operation ${operationId}`
    const loadable = operationPolicies.get(operationId)
    const operation = documentFor(collector, what, 'operation', loadable, operationId)
    if (operation === 'loading') continue
    policies.set(operationId, analyzeOperationPolicy(operationId, { global, api, operation }))
  }
  return policies
}

/** `analyzePolicies` without the side collection, for callers that only need the policies. */
export function effectivePolicies(
  operationIds: readonly string[],
  globalPolicy: Loadable<string>,
  apiPolicy: Loadable<string>,
  operationPolicies: ReadonlyMap<string, Loadable<string>>,
): Map<string, OperationPolicy> {
  return analyzePolicies(newCollector(), operationIds, globalPolicy, apiPolicy, operationPolicies)
}
