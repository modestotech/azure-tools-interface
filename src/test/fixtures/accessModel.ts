import { HttpError } from '@/lib/http'
import {
  apimServiceSchema,
  apiSchema,
  backendSchema,
  operationSchema,
} from '@/services/arm/schemas'
import { directMembers } from '@/services/graph'
import {
  appRoleAssignmentSchema,
  groupMemberSchema,
  servicePrincipalSchema,
} from '@/services/graph/schemas'
import type { AccessModelInputs } from '@/domain/mapper/inputs'
import type { ResourceResult } from '@/services/result'
import { APIM_IDENTITY, armFixtures } from './arm'
import {
  graphFixtures,
  ORDERS_API_SP,
  ORDERS_BACKEND_SP,
  ORDERS_READERS,
  WEBSHOP_SP,
} from './graph'
import apiPolicyXml from './policies/api-policy.xml?raw'
import createOrderPolicyXml from './policies/create-order-policy.xml?raw'
import globalPolicyXml from './policies/global-policy.xml?raw'

/** Mapper inputs for the fictional `orders-api`, as the services would return them. */

export const AUDIENCE = 'api://orders-api.contoso.example.net'
export const RESOURCE = 'api://orders-backend.contoso.example.net'

export const ok = <T>(data: T): ResourceResult<T> => ({ status: 'ok', data })
export const empty: ResourceResult<never> = { status: 'empty' }
export const forbidden: ResourceResult<never> = {
  status: 'forbidden',
  error: new HttpError('forbidden', 'graph', 'Access denied (fictional)'),
}

export const sp = (raw: unknown) => servicePrincipalSchema.parse(raw)
export const assignments = (raw: readonly unknown[] = []) =>
  raw.map((a) => appRoleAssignmentSchema.parse(a))

/** The complete fictional setup, as the services would return it for `orders-api`. */
export function fixtureInputs(): AccessModelInputs {
  return {
    entra: true,
    api: apiSchema.parse(armFixtures.apis[0]),
    service: ok(apimServiceSchema.parse(armFixtures.services[0])),
    operations: ok(
      (armFixtures.operations['orders-api'] ?? []).map((o) => operationSchema.parse(o)),
    ),
    globalPolicy: ok(globalPolicyXml),
    apiPolicy: ok(apiPolicyXml),
    operationPolicies: new Map([
      ['list-orders', empty],
      ['create-order', ok(createOrderPolicyXml)],
    ]),
    backends: new Map([
      ['orders-backend', ok(backendSchema.parse(armFixtures.backends['orders-backend']))],
    ]),
    audiences: new Map([[AUDIENCE, ok([sp(ORDERS_API_SP)])]]),
    appRoleAssignedTo: new Map([
      [ORDERS_API_SP.id, ok(assignments(graphFixtures.appRoleAssignedTo[ORDERS_API_SP.id]))],
    ]),
    principalDetails: ok(new Map([[WEBSHOP_SP.id, ok(sp(WEBSHOP_SP))]])),
    groupMembers: new Map([
      [
        ORDERS_READERS.id,
        ok(
          directMembers(
            (graphFixtures.groupMembers[ORDERS_READERS.id] ?? []).map((m) =>
              groupMemberSchema.parse(m),
            ),
          ),
        ),
      ],
    ]),
    resources: new Map([[RESOURCE, ok([sp(ORDERS_BACKEND_SP)])]]),
    identityAssignments: new Map([
      [
        APIM_IDENTITY.principalId,
        ok(assignments(graphFixtures.appRoleAssignments[APIM_IDENTITY.principalId])),
      ],
    ]),
  }
}
