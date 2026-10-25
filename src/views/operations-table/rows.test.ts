import { buildAccessModel } from '@/domain'
import { fixtureInputs, ok } from '@/test/fixtures/accessModel'
import { exportRow, operationRows } from './rows'

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

describe('operationRows', () => {
  it('summarizes each operation of the complete fixture setup', () => {
    const rows = operationRows(buildAccessModel(fixtureInputs()))
    expect(rows.map(exportRow)).toEqual([
      {
        method: 'GET',
        path: '/orders',
        name: 'List orders',
        auth: 'roles (any): Orders.Read, Orders.Write',
        authScope: 'api',
        // The webshop app, Bob directly, Alice through the group; not the managed identity member.
        callers: 3,
        backend: 'https://ca-contoso-orders.example.net/api',
        backendSource: 'api',
        outboundAuth:
          'user-assigned identity → api://orders-backend.contoso.example.net (roles: Backend.Invoke)',
        needsReview: 0,
        findings: 'Inbound has no <base />: global and product inbound policies are ignored',
      },
      expect.objectContaining({ method: 'POST', name: 'Create order', callers: 3 }),
    ])
    expect(rows[0]?.severity).toBe('info')
  })

  it('shows operations as loading until their policies arrive', () => {
    const rows = operationRows(buildAccessModel({ ...fixtureInputs(), apiPolicy: undefined }))
    expect(rows.map((row) => exportRow(row).auth)).toEqual(['loading…', 'loading…'])
    expect(rows.map((row) => exportRow(row).outboundAuth)).toEqual(['loading…', 'loading…'])
    expect(rows.every((row) => row.findings.length === 0)).toBe(true)
  })

  it('flags an operation without auth as high severity, with no callers', () => {
    const rows = operationRows(
      buildAccessModel({ ...fixtureInputs(), apiPolicy: ok(NO_AUTH_API_POLICY) }),
    )
    expect(rows[0]).toMatchObject({ auth: { kind: 'none' }, callers: 0, severity: 'high' })
    expect(rows[0]?.backendSource).toBe('serviceUrl')
  })

  it('counts elements that need manual review', () => {
    const inputs = fixtureInputs()
    const rows = operationRows(
      buildAccessModel({
        ...inputs,
        operationPolicies: new Map([
          ...inputs.operationPolicies,
          ['create-order', ok(CHOOSE_POLICY)],
        ]),
      }),
    )
    expect(rows.map((row) => row.needsReview)).toEqual([0, 1])
    expect(rows[1]?.severity).toBe('medium')
  })
})

describe('operationRows in ARM-only mode', () => {
  it('leaves callers unknown and says the outbound roles need Entra', () => {
    const rows = operationRows(buildAccessModel({ ...fixtureInputs(), entra: false }))
    expect(rows[0]).toMatchObject({ callers: undefined, entra: false })
    expect(rows.map(exportRow)[0]).toMatchObject({
      callers: 'needs Entra',
      outboundAuth:
        'user-assigned identity → api://orders-backend.contoso.example.net (roles need Entra)',
      auth: 'roles (any): Orders.Read, Orders.Write',
    })
  })
})
