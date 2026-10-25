import { fixtureInputs } from '@/test/fixtures/accessModel'
import { ALICE, BOB, ORDERS_READERS, REPORTING_MI_SP, WEBSHOP_SP } from '@/test/fixtures/graph'
import { buildAccessModel } from './mapper'
import { callersByOperation, principalReach, reachedOperationIds } from './reach'

const model = () => buildAccessModel(fixtureInputs())
const reachOf = (id: string) => principalReach(model()).find((entry) => entry.principal.id === id)

describe('principalReach', () => {
  it('lists every principal by name', () => {
    expect(principalReach(model()).map((entry) => entry.principal.displayName)).toEqual([
      'Alice Andersson',
      'Bob Berg',
      'Contoso Webshop',
      'id-contoso-reporting',
      'Orders Readers',
    ])
  })

  it('reaches an operation directly, or through a group', () => {
    expect(reachOf(WEBSHOP_SP.id)?.paths[0]).toEqual({
      kind: 'direct',
      operationId: 'list-orders',
      roles: ['Orders.Read'],
    })
    expect(reachOf(ALICE.id)?.paths[0]).toMatchObject({
      kind: 'group',
      groupId: ORDERS_READERS.id,
      effective: true,
    })
  })

  it('counts a managed identity in a group as reaching nothing', () => {
    const reach = reachOf(REPORTING_MI_SP.id)
    expect(reach?.paths.every((path) => path.kind === 'group' && !path.effective)).toBe(true)
    expect(reach && reachedOperationIds(reach).size).toBe(0)
  })

  it('counts what a group grants its members', () => {
    const reach = reachOf(ORDERS_READERS.id)
    expect(reach && [...reachedOperationIds(reach)]).toEqual(['list-orders', 'create-order'])
  })
})

describe('callersByOperation', () => {
  it('counts direct callers and users in granting groups, not groups themselves', () => {
    const callers = callersByOperation(model()).get('list-orders')
    expect([...(callers ?? [])].sort()).toEqual([ALICE.id, BOB.id, WEBSHOP_SP.id].sort())
  })
})
