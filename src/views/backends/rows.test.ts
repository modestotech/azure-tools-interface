import { buildAccessModel } from '@/domain'
import { fixtureInputs, ok } from '@/test/fixtures/accessModel'
import { APIM_IDENTITY } from '@/test/fixtures/arm'
import { backendRows } from './rows'

const NO_BACKEND_API_POLICY = `<policies>
  <inbound><base /></inbound>
  <backend><base /></backend>
</policies>`

const MISSING_BACKEND_POLICY = `<policies>
  <inbound><base /><set-backend-service backend-id="gone" /></inbound>
  <backend><base /></backend>
</policies>`

describe('backendRows', () => {
  it('groups operations by backend, with the identity APIM uses there', () => {
    const rows = backendRows(buildAccessModel(fixtureInputs()))
    expect(rows).toHaveLength(1)
    const [row] = rows
    expect(row?.backend?.url).toBe('https://ca-contoso-orders.example.net/api')
    expect(row?.operationIds).toEqual(['list-orders', 'create-order'])
    expect(row?.outbound).toHaveLength(1)
    const use = row?.outbound[0]
    expect(use?.identity).toBe('id-apim-contoso')
    expect(use?.operationIds).toEqual(['list-orders', 'create-order'])
    expect(use?.outbound).toMatchObject({
      principalId: APIM_IDENTITY.principalId,
      roles: [{ value: 'Backend.Invoke' }],
    })
    expect(row?.findings).toEqual([])
  })

  it('falls back to the serviceUrl, once per finding kind', () => {
    const rows = backendRows(
      buildAccessModel({ ...fixtureInputs(), apiPolicy: ok(NO_BACKEND_API_POLICY) }),
    )
    const serviceUrl = rows.find((row) => row.key === 'service-url')
    expect(serviceUrl?.backend?.type).toBe('ApiServiceUrl')
    expect(serviceUrl?.findings.map((finding) => finding.kind)).toEqual(['no-outbound-auth'])
  })

  it('marks a backend that does not exist', () => {
    const inputs = fixtureInputs()
    const rows = backendRows(
      buildAccessModel({
        ...inputs,
        operationPolicies: new Map([
          ...inputs.operationPolicies,
          ['create-order', ok(MISSING_BACKEND_POLICY)],
        ]),
        backends: new Map([...inputs.backends, ['gone', { status: 'empty' }]]),
      }),
    )
    const gone = rows.find((row) => row.key === 'backend:gone')
    expect(gone).toMatchObject({
      backend: undefined,
      missing: true,
      operationIds: ['create-order'],
    })
  })
})
