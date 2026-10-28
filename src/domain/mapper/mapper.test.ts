import { HttpError } from '@/lib/http'
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

  it('flags a validate-jwt that checks no audience, in both modes', () => {
    const noAudience = `<policies>
  <inbound>
    <validate-jwt header-name="Authorization">
      <required-claims>
        <claim name="roles" match="any"><value>Orders.Read</value></claim>
      </required-claims>
    </validate-jwt>
  </inbound>
  <backend><base /></backend>
</policies>`
    expect(findingKinds({ apiPolicy: ok(noAudience) })).toContain('no-audience')
    expect(findingKinds({ apiPolicy: ok(noAudience), entra: false })).toContain('no-audience')
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

describe('buildAccessModel: managed identity without client-id', () => {
  const SYSTEM_IDENTITY_API_POLICY = `<policies>
  <inbound>
    <base />
    <authentication-managed-identity resource="${RESOURCE}" />
  </inbound>
  <backend><base /></backend>
</policies>`

  const withService = (identity: unknown) =>
    buildAccessModel({
      ...fixtureInputs(),
      apiPolicy: ok(SYSTEM_IDENTITY_API_POLICY),
      service: ok(apimServiceSchema.parse({ ...armFixtures.services[0], identity })),
    })

  it("uses the service's system-assigned identity", () => {
    const model = withService({ type: 'SystemAssigned', principalId: 'system-principal' })
    expect(model.operations[0]?.outbound).toMatchObject({ principalId: 'system-principal' })
    expect(kinds(model.findings)).not.toContain('no-system-identity')
  })

  it('flags a service with no system-assigned identity', () => {
    const model = withService(undefined)
    expect(model.operations[0]?.outbound).toMatchObject({ principalId: undefined })
    expect(kinds(model.findings)).toContain('no-system-identity')
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

describe('buildAccessModel: ARM-only mode', () => {
  const NO_ROLES_API_POLICY = `<policies>
  <inbound>
    <validate-jwt header-name="Authorization">
      <audiences><audience>${AUDIENCE}</audience></audiences>
    </validate-jwt>
  </inbound>
  <backend><base /></backend>
</policies>`

  /** The fixture's Graph data is all there, so these tests also show it's never read. */
  const armOnly = (overrides: Partial<AccessModelInputs> = {}) =>
    buildAccessModel({ ...fixtureInputs(), entra: false, ...overrides })

  it('builds from ARM alone and waits for nothing', () => {
    const model = armOnly({
      audiences: new Map(),
      appRoleAssignedTo: new Map(),
      principalDetails: undefined,
      groupMembers: new Map(),
      resources: new Map(),
      identityAssignments: new Map(),
    })
    expect(model.entra).toBe(false)
    expect(model.pending).toEqual([])
    expect(model.problems).toEqual([])
  })

  it('has no principals, grants or memberships, but keeps the routes', () => {
    const model = armOnly()
    expect(model.principals.size).toBe(0)
    expect(model.edges.map((edge) => edge.kind)).toEqual(['route', 'route'])
    expect(model.backends.get('backend:orders-backend')?.url).toBe(
      'https://ca-contoso-orders.example.net/api',
    )
  })

  it('names the identity APIM uses, from ARM, without its target or roles', () => {
    expect(armOnly().operations[0]?.outbound).toEqual({
      mechanism: 'ManagedIdentity',
      source: { scope: 'api', section: 'inbound' },
      clientId: APIM_IDENTITY.clientId,
      principalId: APIM_IDENTITY.principalId,
      resource: RESOURCE,
      targetIds: [],
      roles: [],
    })
  })

  it('raises only the findings the policies and ARM show', () => {
    expect(kinds(armOnly().findings)).toEqual(['parent-inbound-ignored', 'parent-inbound-ignored'])
    const noRoles = armOnly({ apiPolicy: ok(NO_ROLES_API_POLICY) })
    const perOperation = ['parent-inbound-ignored', 'no-role-requirement', 'no-outbound-auth']
    expect(kinds(noRoles.findings)).toEqual([...perOperation, ...perOperation])
  })

  it('names nothing to fetch from Graph', () => {
    expect(modelLookups(armOnly())).toEqual({
      servicePrincipalIds: [],
      groupIds: [],
      identityPrincipalIds: [APIM_IDENTITY.principalId],
    })
  })
})

describe('buildAccessModel: a policy that could not be read', () => {
  const failed = {
    status: 'error' as const,
    error: new HttpError('unexpected-status', 'arm', 'HTTP 500 (fictional)'),
  }
  const unresolvedReasons = (findings: readonly Finding[]) =>
    findings.map((finding) =>
      finding.kind === 'unresolved-rule' ? finding.rule.reason : finding.kind,
    )

  it('concludes nothing for an operation whose API policy failed to load', () => {
    const model = buildAccessModel({ ...fixtureInputs(), apiPolicy: failed })
    for (const access of model.operations) {
      expect(access.policy?.unreadable).toEqual(['api'])
      expect(access.backend).toBeUndefined()
      expect(access.outbound).toBeUndefined()
    }
    // No service-URL fallback, no grants: nothing drawn from the policy.
    expect(model.edges).toEqual([])
    expect(model.backends.size).toBe(0)
    // Not "no auth" or "no outbound auth": only that the policy couldn't be read.
    expect(unresolvedReasons(model.findings)).toEqual([
      'The api policy could not be read: it could not be loaded (unexpected-status)',
      'The api policy could not be read: it could not be loaded (unexpected-status)',
    ])
    expect(model.problems.map((problem) => problem.what)).toEqual(['API policy'])
    expect(model.pending).toEqual([])
  })

  it('keeps the other operations when one operation policy is forbidden', () => {
    const inputs = fixtureInputs()
    const model = buildAccessModel({
      ...inputs,
      operationPolicies: new Map([...inputs.operationPolicies, ['create-order', forbidden]]),
    })
    const [list, create] = model.operations
    expect(list?.backend?.backendKey).toBe('backend:orders-backend')
    expect(list?.outbound?.mechanism).toBe('ManagedIdentity')
    expect(create?.policy?.unreadable).toEqual(['operation'])
    expect(create?.backend).toBeUndefined()
    expect(
      model.edges.some((edge) => 'operationId' in edge && edge.operationId === 'create-order'),
    ).toBe(false)
    expect(
      model.findings
        .filter((f) => 'operationId' in f && f.operationId === 'create-order')
        .map((f) => f.kind),
    ).toEqual(['unresolved-rule'])
  })

  it('treats malformed XML the same way', () => {
    const model = buildAccessModel({ ...fixtureInputs(), globalPolicy: ok('<policies><inbound>') })
    expect(model.operations.every((access) => access.policy?.unreadable.includes('global'))).toBe(
      true,
    )
    expect(model.edges).toEqual([])
    expect(kinds(model.findings)).toEqual(['unresolved-rule', 'unresolved-rule'])
  })

  it('fetches nothing for the policy rules of an unreadable operation', () => {
    const inputs = { ...fixtureInputs(), apiPolicy: failed }
    const policies = effectivePolicies(
      ['list-orders', 'create-order'],
      inputs.globalPolicy,
      inputs.apiPolicy,
      inputs.operationPolicies,
    )
    expect(policyLookups(policies.values())).toEqual({
      audiences: [],
      backendIds: [],
      resources: [],
    })
  })
})
