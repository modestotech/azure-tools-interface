import { largeTenantInputs } from '@/test/fixtures/largeTenant'
import { buildAccessModel } from './mapper'
import { callersByOperation, principalReach } from './reach'

/**
 * The model at a large tenant's scale: results, not timings (those vary by machine). Each
 * operation is reachable by every holder, so the counts are easy to state.
 */
const SIZE = { operations: 100, users: 300, apps: 100, groups: 10, membersPerGroup: 50 }

describe('a large tenant', () => {
  const model = buildAccessModel(largeTenantInputs(SIZE))

  it('grants every holder every operation, once', () => {
    const holders = SIZE.users + SIZE.apps + SIZE.groups
    const grants = model.edges.filter((edge) => edge.kind === 'grant')
    expect(grants).toHaveLength(SIZE.operations * holders)
  })

  it('adds each group membership once, however many operations the group grants', () => {
    const memberships = model.edges.filter((edge) => edge.kind === 'membership')
    expect(memberships).toHaveLength(SIZE.groups * SIZE.membersPerGroup)
  })

  it('counts callers: holders other than groups, plus group members', () => {
    const callers = SIZE.users + SIZE.apps + SIZE.groups * SIZE.membersPerGroup
    for (const set of callersByOperation(model).values()) expect(set.size).toBe(callers)
  })

  it('lists every principal with its paths', () => {
    const reach = principalReach(model)
    expect(reach).toHaveLength(
      SIZE.users + SIZE.apps + SIZE.groups + SIZE.groups * SIZE.membersPerGroup,
    )
    const member = reach.find((entry) => entry.principal.displayName === 'Member 0-0')
    expect(member?.paths).toHaveLength(SIZE.operations)
  })
})
