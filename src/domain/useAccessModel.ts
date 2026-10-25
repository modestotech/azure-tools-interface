import { useMemo } from 'react'
import {
  useApimService,
  useApiPolicy,
  useBackends,
  useGlobalPolicy,
  useOperationPolicies,
  useOperations,
  type ApimServiceRef,
  type ArmApi,
} from '@/services/arm'
import {
  useAppRoleAssignedTo,
  useAppRoleAssignments,
  useGroupMembers,
  useServicePrincipalsByIds,
  useServicePrincipalsForAudiences,
} from '@/services/graph'
import {
  audienceServicePrincipalIds,
  buildAccessModel,
  effectivePolicies,
  modelLookups,
  policyLookups,
  type AccessModel,
  type ModelLookups,
} from './mapper'

const NOT_YET: ModelLookups = { servicePrincipalIds: [], groupIds: [], identityPrincipalIds: [] }
const NO_RESULTS = new Map<string, undefined>()
/** Stable, so the Graph hooks given it stay idle without re-rendering. */
const NONE: readonly string[] = []

/**
 * Loads and builds the access model of one API. Fetching only: the order of the waterfall comes
 * from the domain's lookup functions, and the model from the pure `buildAccessModel()`.
 *
 * 1. ARM: the service, operations and policies at every scope.
 * 2. From the policies: backends, and the service principals behind audiences and resources;
 *    then the role holders on the API's service principals.
 * 3. From the model so far: details of role-holding apps, members of granting groups, and the
 *    app roles APIM's identity holds.
 *
 * Returns undefined until an API is chosen, then a model that fills in as data arrives
 * (`model.pending` lists what's still loading).
 *
 * With `entra` false (ARM-only mode), every Graph hook gets an empty input and stays idle: not one
 * Graph request is made, and the model is built from ARM alone.
 */
export function useAccessModel(
  svc: ApimServiceRef | undefined,
  api: ArmApi | undefined,
  /** Required, so no caller falls back to using Entra by forgetting it. */
  entra: boolean,
): AccessModel | undefined {
  const apiId = api?.name
  // Analysis starts only once an API is chosen; even the service-level reads wait for it.
  const analyzed = api ? svc : undefined

  // 1. ARM
  const service = useApimService(analyzed).data
  const operations = useOperations(svc, apiId).data
  const globalPolicy = useGlobalPolicy(analyzed).data
  const apiPolicy = useApiPolicy(svc, apiId).data
  const operationIds = useMemo(
    () => (operations?.status === 'ok' ? operations.data.map((operation) => operation.name) : []),
    [operations],
  )
  const operationPolicies = useOperationPolicies(svc, apiId, operationIds)

  // 2. What the policies name
  const lookups = useMemo(
    () =>
      policyLookups(
        effectivePolicies(operationIds, globalPolicy, apiPolicy, operationPolicies).values(),
      ),
    [operationIds, globalPolicy, apiPolicy, operationPolicies],
  )
  const backends = useBackends(svc, lookups.backendIds)
  const audiences = useServicePrincipalsForAudiences(entra ? lookups.audiences : NONE)
  const resources = useServicePrincipalsForAudiences(entra ? lookups.resources : NONE)
  const apiServicePrincipalIds = useMemo(() => audienceServicePrincipalIds(audiences), [audiences])
  const appRoleAssignedTo = useAppRoleAssignedTo(apiServicePrincipalIds)

  // 3. What the model so far names
  const firstPass = useMemo(
    () =>
      api &&
      buildAccessModel({
        entra,
        api,
        service,
        operations,
        globalPolicy,
        apiPolicy,
        operationPolicies,
        backends,
        audiences,
        appRoleAssignedTo,
        principalDetails: undefined,
        groupMembers: NO_RESULTS,
        resources,
        identityAssignments: NO_RESULTS,
      }),
    [
      entra,
      api,
      service,
      operations,
      globalPolicy,
      apiPolicy,
      operationPolicies,
      backends,
      audiences,
      appRoleAssignedTo,
      resources,
    ],
  )
  const next = useMemo(() => (firstPass ? modelLookups(firstPass) : NOT_YET), [firstPass])
  const principalDetails = useServicePrincipalsByIds(
    api && entra ? next.servicePrincipalIds : undefined,
  ).data
  const groupMembers = useGroupMembers(entra ? next.groupIds : NONE)
  // The identity's principal ID comes from ARM, so this one would run without Entra: gate it too.
  const identityAssignments = useAppRoleAssignments(entra ? next.identityPrincipalIds : NONE)

  return useMemo(
    () =>
      api &&
      buildAccessModel({
        entra,
        api,
        service,
        operations,
        globalPolicy,
        apiPolicy,
        operationPolicies,
        backends,
        audiences,
        appRoleAssignedTo,
        principalDetails,
        groupMembers,
        resources,
        identityAssignments,
      }),
    [
      entra,
      api,
      service,
      operations,
      globalPolicy,
      apiPolicy,
      operationPolicies,
      backends,
      audiences,
      appRoleAssignedTo,
      principalDetails,
      groupMembers,
      resources,
      identityAssignments,
    ],
  )
}
