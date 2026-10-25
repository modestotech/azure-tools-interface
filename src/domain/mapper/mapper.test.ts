import { apimServiceSchema, apiSchema, operationSchema } from '@/services/arm/schemas'
import {
  AUDIENCE,
  empty,
  fixtureInputs,
  forbidden,
  ok,
  RESOURCE,
  sp,
} from '@/test/fixtures/accessModel'
import { APIM_IDENTITY, armFixtures } from '@/test/fixtures/arm'
import {
  ALICE,
  BOB,
  ORDERS_API_SP,
  ORDERS_BACKEND_SP,
  ORDERS_READERS,
  REPORTING_MI_SP,
  WEBSHOP_SP,
} from '@/test/fixtures/graph'
import type { Finding } from '../findings'
import { buildAccessModel } from './buildAccessModel'
import { meetsClaim } from './inbound'
import type { AccessModelInputs } from './inputs'
import { modelLookups, policyLookups } from './lookups'
import { effectivePolicies } from './policies'

const kinds = (findings: readonly Finding[]) => findings.map((finding) => finding.kind)

describe('buildAccessModel: the complete fixture setup', () => {
  const model = buildAccessModel(fixtureInputs())

  it('is complete, with nothing pending and no load problems', () => {
    expect(model.pending).toEqual([])
    expect(model.problems).toEqual([])
  })

  it('grants each operation to the role holders that meet roles match="any"', () => {
    const grants = model.edges.filter((edge) => edge.kind === 'grant')
    expect(grants.map((g) => [g.operationId, g.principalId, g.roles])).toEqual([
      ['list-orders', WEBSHOP_SP.id, ['Orders.Read']],
      ['list-orders', ORDERS_READERS.id, ['Orders.Read']],
      ['list-orders', BOB.id, ['Orders.Write']],
      ['create-order', WEBSHOP_SP.id, ['Orders.Read']],
      ['create-order', ORDERS_READERS.id, ['Orders.Read']],
      ['create-order', BOB.id, ['Orders.Write']],
    ])
  })

  it("lists the granting group's direct members once, a managed identity as not effective", () => {
    const memberships = model.edges.filter((edge) => edge.kind === 'membership')
    expect(memberships.map((m) => [m.memberId, m.effective])).toEqual([
      [ALICE.id, true],
      [REPORTING_MI_SP.id, false],
    ])
    expect(memberships[1]?.reason).toContain('own identity')
  })

  it('knows who each principal is', () => {
    expect(model.principals.get(WEBSHOP_SP.id)).toEqual({
      kind: 'servicePrincipal',
      id: WEBSHOP_SP.id,
      appId: WEBSHOP_SP.appId,
      displayName: 'Contoso Webshop',
    })
    expect(model.principals.get(ALICE.id)).toMatchObject({
      kind: 'user',
      userPrincipalName: 'alice@contoso.example.net',
    })
    expect(model.principals.get(REPORTING_MI_SP.id)?.kind).toBe('managedIdentity')
    expect(model.principals.get(ORDERS_READERS.id)?.kind).toBe('group')
  })

  it('routes to the backend and authenticates with the user-assigned identity', () => {
    const [listOrders] = model.operations
    expect(listOrders?.backend).toMatchObject({ backendKey: 'backend:orders-backend' })
    expect(listOrders?.outbound).toMatchObject({
      mechanism: 'ManagedIdentity',
      clientId: APIM_IDENTITY.clientId,
      principalId: APIM_IDENTITY.principalId,
      targetIds: [ORDERS_BACKEND_SP.id],
      roles: [{ value: 'Backend.Invoke' }],
    })
    expect(model.backends.get('backend:orders-backend')?.url).toBe(
      'https://ca-contoso-orders.example.net/api',
    )
  })

  it('reports only what the setup really has: ignored parent inbound and an ineffective member', () => {
    expect(kinds(model.findings)).toEqual([
      'parent-inbound-ignored',
      'ineffective-member',
      'parent-inbound-ignored',
    ])
  })

  it('derives the next lookups from policies and from the model', () => {
    const policies = model.operations.flatMap((op) => (op.policy ? [op.policy] : []))
    expect(policyLookups(policies)).toEqual({
      audiences: [AUDIENCE],
      backendIds: ['orders-backend'],
      resources: [RESOURCE],
    })
    expect(modelLookups(model)).toEqual({
      servicePrincipalIds: [WEBSHOP_SP.id],
      groupIds: [ORDERS_READERS.id],
      identityPrincipalIds: [APIM_IDENTITY.principalId],
    })
  })
})

describe('buildAccessModel: partial data', () => {
  it('shows policies and routes before Graph answers, without false findings', () => {
    const model = buildAccessModel({
      ...fixtureInputs(),
      audiences: new Map(),
      resources: new Map(),
      appRoleAssignedTo: new Map(),
      identityAssignments: new Map(),
      groupMembers: new Map(),
      principalDetails: undefined,
    })
    expect(model.edges.map((edge) => edge.kind)).toEqual(['route', 'route'])
    expect(kinds(model.findings)).toEqual(['parent-inbound-ignored', 'parent-inbound-ignored'])
    expect(model.pending).toContain(`service principal for audience ${AUDIENCE}`)
  })

  it('waits for policies before analyzing an operation', () => {
    const model = buildAccessModel({ ...fixtureInputs(), apiPolicy: undefined })
    expect(model.operations.every((op) => op.policy === undefined)).toBe(true)
    expect(model.findings).toEqual([])
    expect(model.pending).toEqual(['API policy'])
  })

  it('lists a forbidden lookup as a problem and keeps building the rest', () => {
    const model = buildAccessModel({
      ...fixtureInputs(),
      appRoleAssignedTo: new Map([[ORDERS_API_SP.id, forbidden]]),
    })
    expect(model.problems).toMatchObject([
      { what: 'role assignments on Orders API', status: 'forbidden' },
    ])
    expect(model.edges.filter((edge) => edge.kind === 'grant')).toEqual([])
    expect(model.operations[0]?.outbound?.mechanism).toBe('ManagedIdentity')
  })

  it('turns a policy that failed to load into an unresolved rule', () => {
    const model = buildAccessModel({ ...fixtureInputs(), apiPolicy: forbidden })
    expect(kinds(model.findings)).toContain('unresolved-rule')
    expect(model.problems).toMatchObject([{ what: 'API policy', status: 'forbidden' }])
  })
})

describe('buildAccessModel: findings', () => {
  const findingKinds = (overrides: Partial<AccessModelInputs>) =>
    new Set(kinds(buildAccessModel({ ...fixtureInputs(), ...overrides }).findings))

  it('flags an API without policies: no auth, no outbound auth, plain-HTTP serviceUrl', () => {
    const found = findingKinds({
      api: apiSchema.parse(armFixtures.apis[1]),
      globalPolicy: empty,
      apiPolicy: empty,
      operations: ok([operationSchema.parse(armFixtures.operations['inventory-api']?.[0])]),
      operationPolicies: new Map([['get-stock', empty]]),
    })
    expect([...found]).toEqual(['no-auth', 'http-backend', 'no-outbound-auth'])
  })

  it('flags an audience with no service principal', () => {
    expect(findingKinds({ audiences: new Map([[AUDIENCE, ok([])]]) })).toContain(
      'audience-not-found',
    )
  })

  it("flags a required role the API doesn't define", () => {
    const readOnly = { ...ORDERS_API_SP, appRoles: ORDERS_API_SP.appRoles.slice(0, 1) }
    expect(findingKinds({ audiences: new Map([[AUDIENCE, ok([sp(readOnly)])]]) })).toContain(
      'unknown-role',
    )
  })

  it('flags a missing backend, an unknown client-id and an identity without roles', () => {
    expect(findingKinds({ backends: new Map([['orders-backend', empty]]) })).toContain(
      'backend-not-found',
    )
    const noIdentities = { ...armFixtures.services[0], identity: { type: 'SystemAssigned' } }
    expect(findingKinds({ service: ok(apimServiceSchema.parse(noIdentities)) })).toContain(
      'identity-not-found',
    )
    expect(
      findingKinds({ identityAssignments: new Map([[APIM_IDENTITY.principalId, ok([])]]) }),
    ).toContain('identity-has-no-role')
    expect(findingKinds({ resources: new Map([[RESOURCE, ok([])]]) })).toContain(
      'resource-not-found',
    )
  })
})

describe('meetsClaim', () => {
  const held = new Set(['A', 'B'])

  it('needs one value for match="any" and every value for match="all"', () => {
    expect(meetsClaim(held, { name: 'roles', match: 'any', values: ['A', 'X'] })).toEqual(['A'])
    expect(meetsClaim(held, { name: 'roles', match: 'all', values: ['A', 'B'] })).toEqual([
      'A',
      'B',
    ])
    expect(meetsClaim(held, { name: 'roles', match: 'all', values: ['A', 'X'] })).toEqual([])
  })
})

describe('effectivePolicies', () => {
  it('analyzes each operation whose policies have loaded', () => {
    const inputs = fixtureInputs()
    const policies = effectivePolicies(
      ['list-orders', 'create-order', 'still-loading'],
      inputs.globalPolicy,
      inputs.apiPolicy,
      inputs.operationPolicies,
    )
    expect([...policies.keys()]).toEqual(['list-orders', 'create-order'])
  })
})
