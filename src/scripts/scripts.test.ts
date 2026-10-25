import { buildAccessModel } from '@/domain'
import { fixtureInputs, ok } from '@/test/fixtures/accessModel'
import { REPORTING_MI_SP } from '@/test/fixtures/graph'
import { operationLookup } from './operations'
import { scripts } from './registry'
import { backendIssuesScript } from './starter/backendIssues'
import { broadAccessScript } from './starter/broadAccess'
import { ineffectiveMembersScript } from './starter/ineffectiveMembers'
import { noAuthScript } from './starter/noAuth'
import { unresolvedRulesScript } from './starter/unresolvedRules'
import { defaultParams, type ScriptDefinition } from './types'

const NO_AUTH_API_POLICY = `<policies>
  <inbound><base /></inbound>
  <backend><base /></backend>
</policies>`

const CHOOSE_POLICY = `<policies>
  <inbound>
    <base />
    <choose><when condition="@(true)"><set-backend-service backend-id="other" /></when></choose>
  </inbound>
  <backend><base /></backend>
</policies>`

const complete = () => buildAccessModel(fixtureInputs())
const noAuth = () => {
  const inputs = fixtureInputs()
  return buildAccessModel({
    ...inputs,
    api: { ...inputs.api, serviceUrl: 'http://orders.example.net' },
    apiPolicy: ok(NO_AUTH_API_POLICY),
  })
}

const run = (script: ScriptDefinition, model = complete(), params = defaultParams(script)) =>
  script.run(model, params)

describe('the script registry', () => {
  it('has unique IDs, and every row only uses declared columns', () => {
    expect(new Set(scripts.map((script) => script.id)).size).toBe(scripts.length)
    for (const script of scripts) {
      for (const model of [complete(), noAuth()]) {
        const result = run(script, model)
        const keys = new Set(result.columns.map((column) => column.key))
        for (const row of result.rows) {
          for (const key of Object.keys(row)) expect(keys, `${script.id}: ${key}`).toContain(key)
        }
      }
    }
  })
})

describe('noAuthScript', () => {
  it('finds nothing when every operation requires a role', () => {
    expect(run(noAuthScript).rows).toEqual([])
  })

  it('lists operations without validate-jwt', () => {
    expect(run(noAuthScript, noAuth()).rows).toEqual([
      { method: 'GET', path: '/orders', name: 'List orders', issue: 'no validate-jwt' },
      { method: 'POST', path: '/orders', name: 'Create order', issue: 'no validate-jwt' },
    ])
  })
})

describe('broadAccessScript', () => {
  it('lists callers of more than N operations, most first', () => {
    const rows = run(broadAccessScript).rows
    expect(rows.map((row) => [row.name, row.operations, row.through])).toEqual([
      ['Alice Andersson', 2, 'Orders Readers'],
      ['Bob Berg', 2, ''],
      ['Contoso Webshop', 2, ''],
    ])
  })

  it('takes N as a parameter', () => {
    expect(run(broadAccessScript, complete(), { n: 2 }).rows).toEqual([])
    expect(run(broadAccessScript, complete(), { n: 0 }).rows).toHaveLength(3)
  })
})

describe('ineffectiveMembersScript', () => {
  it('lists the managed identity in a granting group', () => {
    expect(run(ineffectiveMembersScript).rows).toEqual([
      {
        group: 'Orders Readers',
        member: 'id-contoso-reporting',
        memberType: 'Managed identity',
        memberId: REPORTING_MI_SP.id,
        groupGrants: 'GET /orders, POST /orders',
      },
    ])
  })
})

describe('backendIssuesScript', () => {
  it('finds nothing for the reference setup', () => {
    expect(run(backendIssuesScript).rows).toEqual([])
  })

  it('groups issues per backend, listing the operations', () => {
    const rows = run(backendIssuesScript, noAuth()).rows
    expect(rows.map((row) => [row.url, row.severity, row.operations])).toEqual([
      ['http://orders.example.net', 'high', 'GET /orders, POST /orders'],
      ['http://orders.example.net', 'medium', 'GET /orders, POST /orders'],
    ])
  })
})

describe('unresolvedRulesScript', () => {
  it('lists elements to review, with their XML', () => {
    const inputs = fixtureInputs()
    const model = buildAccessModel({
      ...inputs,
      operationPolicies: new Map([
        ...inputs.operationPolicies,
        ['create-order', ok(CHOOSE_POLICY)],
      ]),
    })
    expect(run(unresolvedRulesScript, model).rows).toEqual([
      expect.objectContaining({
        operation: 'POST /orders',
        scope: 'operation',
        section: 'inbound',
        element: 'choose',
        xml: expect.stringContaining('<choose>') as unknown,
      }),
    ])
  })
})

describe('operationLookup', () => {
  it('names up to max operations and counts the rest', () => {
    const lookup = operationLookup(complete())
    expect(lookup.list(['list-orders', 'create-order', 'list-orders'])).toBe(
      'GET /orders, POST /orders',
    )
    expect(lookup.list(['list-orders', 'create-order', 'gone'], 1)).toBe('GET /orders and 2 more')
  })
})
