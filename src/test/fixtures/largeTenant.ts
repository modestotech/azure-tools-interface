import { operationSchema } from '@/services/arm/schemas'
import { groupMemberSchema } from '@/services/graph/schemas'
import { directMembers } from '@/services/graph'
import type { AccessModelInputs } from '@/domain/mapper/inputs'
import { assignments, fixtureInputs, ok } from './accessModel'
import { ORDERS_API_SP, ROLE } from './graph'

/**
 * The fictional `orders-api` scaled up: many operations, many role holders and big groups, for
 * checking that the model and the views stay fast on a large tenant. Every operation inherits the
 * API policy, so every holder of Orders.Read or Orders.Write reaches every operation.
 */

export interface LargeTenantSize {
  readonly operations: number
  readonly users: number
  readonly apps: number
  readonly groups: number
  readonly membersPerGroup: number
}

const guid = (prefix: number, n: number) =>
  `${String(prefix).padStart(8, '0')}-0000-0000-0000-${n.toString().padStart(12, '0')}`

export function largeTenantInputs(size: LargeTenantSize): AccessModelInputs {
  const base = fixtureInputs()
  const operations = Array.from({ length: size.operations }, (_, i) =>
    operationSchema.parse({
      id: `ops/op-${String(i)}`,
      name: `op-${String(i)}`,
      properties: {
        displayName: `Operation ${String(i)}`,
        method: i % 2 ? 'POST' : 'GET',
        urlTemplate: `/things/${String(i)}`,
      },
    }),
  )
  const assignment = (id: string, principalType: string, n: number) => ({
    id: `assign-${id}`,
    appRoleId: n % 2 ? ROLE.ordersWrite : ROLE.ordersRead,
    principalId: id,
    principalType,
    principalDisplayName: `${principalType} ${String(n)}`,
    resourceId: ORDERS_API_SP.id,
  })
  const users = Array.from({ length: size.users }, (_, i) => assignment(guid(1, i), 'User', i))
  const apps = Array.from({ length: size.apps }, (_, i) =>
    assignment(guid(2, i), 'ServicePrincipal', i),
  )
  const groups = Array.from({ length: size.groups }, (_, i) => assignment(guid(3, i), 'Group', i))
  const members = (group: number) =>
    directMembers(
      Array.from({ length: size.membersPerGroup }, (_, i) =>
        groupMemberSchema.parse({
          '@odata.type': '#microsoft.graph.user',
          id: guid(4, group * size.membersPerGroup + i),
          displayName: `Member ${String(group)}-${String(i)}`,
          userPrincipalName: `member-${String(group)}-${String(i)}@contoso.example.net`,
        }),
      ),
    )
  return {
    ...base,
    operations: ok(operations),
    operationPolicies: new Map(
      operations.map((operation) => [operation.name, { status: 'empty' }]),
    ),
    appRoleAssignedTo: new Map([
      [ORDERS_API_SP.id, ok(assignments([...users, ...apps, ...groups]))],
    ]),
    principalDetails: ok(new Map()),
    groupMembers: new Map(groups.map((group, i) => [group.principalId, ok(members(i))])),
  }
}
