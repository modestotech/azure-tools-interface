import { APIM_IDENTITY } from './arm'

/**
 * Fictional Entra objects in raw Graph v1.0 shapes, matching `arm.ts` and `api-policy.xml`:
 * - the policy's audience is the Orders API service principal, which defines both required roles
 * - the policy's `resource` is the Orders backend, on which APIM's identity holds a role
 * - callers: an app with a direct assignment, a user, and a group whose direct members are a user,
 *   a managed identity (not effective through a group) and a nested group (to be filtered out)
 */

const guid = (n: number) => `00000000-0000-0000-0000-${n.toString().padStart(12, '0')}`

const NO_ROLES: readonly unknown[] = []

const appRole = (id: string, value: string, displayName: string) => ({
  id,
  value,
  displayName,
  description: `${displayName} (fictional)`,
  allowedMemberTypes: ['Application', 'User'],
  isEnabled: true,
  origin: 'Application',
})

const servicePrincipal = (
  id: string,
  appId: string,
  displayName: string,
  servicePrincipalType: string,
  servicePrincipalNames: readonly string[],
  appRoles: readonly unknown[] = NO_ROLES,
) => ({
  '@odata.type': '#microsoft.graph.servicePrincipal',
  id,
  appId,
  displayName,
  servicePrincipalType,
  servicePrincipalNames: [...servicePrincipalNames, appId],
  appRoles,
  accountEnabled: true,
})

export const ROLE = {
  ordersRead: guid(23),
  ordersWrite: guid(24),
  backendInvoke: guid(33),
}

export const ORDERS_API_SP = servicePrincipal(
  guid(21),
  guid(22),
  'Orders API',
  'Application',
  ['api://orders-api.contoso.example.net'],
  [
    appRole(ROLE.ordersRead, 'Orders.Read', 'Read orders'),
    appRole(ROLE.ordersWrite, 'Orders.Write', 'Write orders'),
  ],
)

export const ORDERS_BACKEND_SP = servicePrincipal(
  guid(31),
  guid(32),
  'Orders backend',
  'Application',
  ['api://orders-backend.contoso.example.net'],
  [appRole(ROLE.backendInvoke, 'Backend.Invoke', 'Invoke the backend')],
)

export const APIM_IDENTITY_SP = servicePrincipal(
  APIM_IDENTITY.principalId,
  APIM_IDENTITY.clientId,
  'id-apim-contoso',
  'ManagedIdentity',
  [],
)

export const WEBSHOP_SP = servicePrincipal(guid(41), guid(42), 'Contoso Webshop', 'Application', [])
export const REPORTING_MI_SP = servicePrincipal(
  guid(62),
  guid(64),
  'id-contoso-reporting',
  'ManagedIdentity',
  [],
)

const user = (id: string, displayName: string, userPrincipalName: string) => ({
  '@odata.type': '#microsoft.graph.user',
  id,
  displayName,
  userPrincipalName,
  mail: userPrincipalName,
})

export const ALICE = user(guid(61), 'Alice Andersson', 'alice@contoso.example.net')
export const BOB = user(guid(63), 'Bob Berg', 'bob@contoso.example.net')

const group = (id: string, displayName: string) => ({
  '@odata.type': '#microsoft.graph.group',
  id,
  displayName,
  description: `${displayName} (fictional)`,
  securityEnabled: true,
  mailEnabled: false,
  groupTypes: [],
})

export const ORDERS_READERS = group(guid(51), 'Orders Readers')
export const ORDERS_READERS_EU = group(guid(52), 'Orders Readers EU')

const assignment = (
  id: string,
  appRoleId: string,
  principal: { id: string; displayName: string },
  principalType: string,
  resource: { id: string; displayName: string },
) => ({
  id,
  appRoleId,
  principalId: principal.id,
  principalType,
  principalDisplayName: principal.displayName,
  resourceId: resource.id,
  resourceDisplayName: resource.displayName,
  createdDateTime: '2026-01-15T09:00:00Z',
  deletedDateTime: null,
})

export const graphFixtures = {
  servicePrincipals: [
    ORDERS_API_SP,
    ORDERS_BACKEND_SP,
    APIM_IDENTITY_SP,
    WEBSHOP_SP,
    REPORTING_MI_SP,
  ],
  groups: [ORDERS_READERS, ORDERS_READERS_EU],
  /** Keyed by the service principal that holds the roles (resource side). */
  appRoleAssignedTo: {
    [ORDERS_API_SP.id]: [
      assignment(
        'assign-webshop-read',
        ROLE.ordersRead,
        WEBSHOP_SP,
        'ServicePrincipal',
        ORDERS_API_SP,
      ),
      assignment('assign-readers-read', ROLE.ordersRead, ORDERS_READERS, 'Group', ORDERS_API_SP),
      assignment('assign-bob-write', ROLE.ordersWrite, BOB, 'User', ORDERS_API_SP),
    ],
  } as Readonly<Record<string, readonly unknown[]>>,
  /** Keyed by the principal that was granted the roles. */
  appRoleAssignments: {
    [APIM_IDENTITY_SP.id]: [
      assignment(
        'assign-apim-backend',
        ROLE.backendInvoke,
        APIM_IDENTITY_SP,
        'ServicePrincipal',
        ORDERS_BACKEND_SP,
      ),
    ],
  } as Readonly<Record<string, readonly unknown[]>>,
  /** Direct members. Orders Readers has three, so with a page size of 2 it spans two pages. */
  groupMembers: {
    [ORDERS_READERS.id]: [ALICE, REPORTING_MI_SP, ORDERS_READERS_EU],
    [ORDERS_READERS_EU.id]: [BOB],
  } as Readonly<Record<string, readonly unknown[]>>,
}
