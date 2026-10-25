import type { HttpError } from '@/lib/http'
import type { ArmApi, ArmApimService, ArmBackend, ArmOperation } from '@/services/arm'
import type {
  BatchResults,
  GraphAppRoleAssignment,
  GraphDirectMember,
  GraphServicePrincipal,
} from '@/services/graph'
import type { ResourceResult } from '@/services/result'
import type { Finding } from '../findings'

/** A resource as the mapper sees it: loaded (ok / empty / forbidden / error), or still loading. */
export type Loadable<T> = ResourceResult<T> | undefined

/**
 * Everything fetched for one API, keyed the way it was looked up. Any part may still be loading,
 * so the model can be built (and shown) at every step.
 */
export interface AccessModelInputs {
  /**
   * Whether Entra (Microsoft Graph) is used. When it isn't (ARM-only mode), the Graph inputs below
   * are never read: nothing waits on them, and no finding that needs Entra data is raised.
   */
  readonly entra: boolean
  readonly api: ArmApi
  readonly service: Loadable<ArmApimService>
  readonly operations: Loadable<readonly ArmOperation[]>
  readonly globalPolicy: Loadable<string>
  readonly apiPolicy: Loadable<string>
  /** By operation ID. */
  readonly operationPolicies: ReadonlyMap<string, Loadable<string>>
  /** By backend ID from `set-backend-service`. */
  readonly backends: ReadonlyMap<string, Loadable<ArmBackend>>
  /** By `validate-jwt` audience: the service principals it resolves to. */
  readonly audiences: ReadonlyMap<string, Loadable<readonly GraphServicePrincipal[]>>
  /** By the API service principal's object ID. */
  readonly appRoleAssignedTo: ReadonlyMap<string, Loadable<readonly GraphAppRoleAssignment[]>>
  /** Details of the service principals that hold roles (app or managed identity, appId). */
  readonly principalDetails: Loadable<BatchResults<GraphServicePrincipal>>
  /** By group ID: direct members, nested groups already removed. */
  readonly groupMembers: ReadonlyMap<string, Loadable<readonly GraphDirectMember[]>>
  /** By `authentication-managed-identity` resource: the service principals it resolves to. */
  readonly resources: ReadonlyMap<string, Loadable<readonly GraphServicePrincipal[]>>
  /** By APIM identity principal ID: the app roles it holds. */
  readonly identityAssignments: ReadonlyMap<string, Loadable<readonly GraphAppRoleAssignment[]>>
}

/** A resource that couldn't be loaded. Shown per resource; the rest of the model still builds. */
export interface LoadProblem {
  readonly what: string
  readonly status: 'forbidden' | 'error'
  readonly error: HttpError
}

/** What building the model collects on the side. */
export interface Collector {
  readonly findings: Finding[]
  readonly problems: LoadProblem[]
  /** Inputs the model needed that are still loading, by `what`. */
  readonly pending: Set<string>
}

export function newCollector(): Collector {
  return { findings: [], problems: [], pending: new Set() }
}

/**
 * Reads a loadable: its data, `null` when it's empty, or `undefined` when it isn't available yet
 * (counted as pending) or failed (recorded as a problem). Each failure is recorded once per `what`.
 */
export function read<T>(
  collector: Collector,
  what: string,
  loadable: Loadable<T>,
): T | null | undefined {
  if (loadable === undefined) {
    collector.pending.add(what)
    return undefined
  }
  switch (loadable.status) {
    case 'ok':
      return loadable.data
    case 'empty':
      return null
    default:
      if (!collector.problems.some((problem) => problem.what === what)) {
        collector.problems.push({ what, status: loadable.status, error: loadable.error })
      }
      return undefined
  }
}
