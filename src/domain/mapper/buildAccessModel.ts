import type { Finding } from '../findings'
import type {
  AccessEdge,
  Api,
  ApimService,
  Backend,
  BackendBinding,
  Operation,
  OperationPolicy,
  OutboundAuth,
  Principal,
} from '../model'
import type { MapperContext } from './context'
import { resolveInbound } from './inbound'
import { newCollector, read, type AccessModelInputs, type LoadProblem } from './inputs'
import { toApi, toApimService, toOperation } from './normalize'
import { resolveOutbound } from './outbound'
import { analyzePolicies } from './policies'

export interface OperationAccess {
  readonly operation: Operation
  /** Undefined while the operation's policies load. */
  readonly policy: OperationPolicy | undefined
  readonly backend: BackendBinding | undefined
  readonly outbound: OutboundAuth | undefined
}

/** Everything the views and scripts read about the selected API. */
export interface AccessModel {
  readonly api: Api
  readonly service: ApimService | undefined
  readonly operations: readonly OperationAccess[]
  readonly principals: ReadonlyMap<string, Principal>
  readonly backends: ReadonlyMap<string, Backend>
  readonly edges: readonly AccessEdge[]
  readonly findings: readonly Finding[]
  /** Resources that couldn't be loaded; the rest of the model is still built. */
  readonly problems: readonly LoadProblem[]
  /** Inputs still loading. The model is complete when this is empty. */
  readonly pending: readonly string[]
}

function policyFindings(policy: OperationPolicy): Finding[] {
  const { operationId } = policy
  return [
    ...policy.droppedParents
      .filter((dropped) => dropped.section === 'inbound')
      .map((dropped): Finding => ({
        kind: 'parent-inbound-ignored',
        operationId,
        scope: dropped.scope,
      })),
    ...policy.unresolved.map((rule): Finding => ({ kind: 'unresolved-rule', operationId, rule })),
  ]
}

/**
 * Builds the access model from whatever has loaded so far. Pure: no fetching, no clock, no
 * randomness, so the same inputs always give the same model.
 */
export function buildAccessModel(inputs: AccessModelInputs): AccessModel {
  const collector = newCollector()
  const api = toApi(inputs.api)
  const service = read(collector, 'APIM service', inputs.service)
  const operations = (read(collector, 'operations', inputs.operations) ?? []).map(toOperation)
  const policies = analyzePolicies(
    collector,
    operations.map((operation) => operation.id),
    inputs.globalPolicy,
    inputs.apiPolicy,
    inputs.operationPolicies,
  )
  const context: MapperContext = {
    inputs,
    collector,
    principals: new Map(),
    backends: new Map(),
    edges: [],
    addedHolders: new Set(),
    readGroups: new Set(),
  }
  const access = operations.map((operation): OperationAccess => {
    const policy = policies.get(operation.id)
    if (!policy) return { operation, policy, backend: undefined, outbound: undefined }
    collector.findings.push(...policyFindings(policy))
    resolveInbound(context, policy)
    return { operation, policy, ...resolveOutbound(context, api, policy) }
  })
  return {
    api,
    service: service ? toApimService(service) : undefined,
    operations: access,
    principals: context.principals,
    backends: context.backends,
    edges: context.edges,
    findings: collector.findings,
    problems: collector.problems,
    pending: [...collector.pending],
  }
}
