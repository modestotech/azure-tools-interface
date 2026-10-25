import { buildAccessModel } from '@/domain'
import { fixtureInputs, ok } from '@/test/fixtures/accessModel'
import { authCoverage, findingsByKind } from './summary'

const NO_AUTH_API_POLICY = `<policies>
  <inbound><base /></inbound>
  <backend><base /></backend>
</policies>`

describe('authCoverage', () => {
  it('counts operations by how they are protected', () => {
    expect(authCoverage(buildAccessModel(fixtureInputs()))).toEqual([
      { coverage: 'roles', operations: 2 },
    ])
  })

  it('counts unprotected and loading operations', () => {
    const inputs = fixtureInputs()
    const noAuth = buildAccessModel({ ...inputs, apiPolicy: ok(NO_AUTH_API_POLICY) })
    expect(authCoverage(noAuth)).toEqual([{ coverage: 'none', operations: 2 }])
    const loading = buildAccessModel({ ...inputs, apiPolicy: undefined })
    expect(authCoverage(loading)).toEqual([{ coverage: 'loading', operations: 2 }])
  })
})

describe('findingsByKind', () => {
  it('counts findings per kind, most severe first', () => {
    const model = buildAccessModel({ ...fixtureInputs(), apiPolicy: ok(NO_AUTH_API_POLICY) })
    const counts = findingsByKind(model)
    expect(counts.map((item) => [item.kind, item.severity, item.count])).toEqual([
      ['no-auth', 'high', 2],
      ['no-outbound-auth', 'medium', 2],
    ])
  })
})

describe('authCoverage with an unreadable policy', () => {
  it('counts the operations as unreadable, not as unprotected', () => {
    const model = buildAccessModel({ ...fixtureInputs(), globalPolicy: ok('<policies><inbound>') })
    expect(authCoverage(model)).toEqual([{ coverage: 'unreadable', operations: 2 }])
    expect(findingsByKind(model).map((item) => item.kind)).toEqual(['unresolved-rule'])
  })
})
