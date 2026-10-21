import apiPolicyXml from '@/test/fixtures/policies/api-policy.xml?raw'
import createOrderPolicyXml from '@/test/fixtures/policies/create-order-policy.xml?raw'
import globalPolicyXml from '@/test/fixtures/policies/global-policy.xml?raw'
import type { XmlElement } from '../model'
import { analyzeOperationPolicy, type OperationDocuments } from './analyze'
import { composeSection } from './compose'
import { parsePolicyDocument } from './policyDocument'
import { childElements, parseXml, toXml } from './xmlTree'

/** A policy document with the given inbound and backend content; outbound/on-error just `<base />`. */
function policy(inbound: string, backend = '<base />'): string {
  return `<policies><inbound>${inbound}</inbound><backend>${backend}</backend><outbound><base /></outbound><on-error><base /></on-error></policies>`
}

const global = parsePolicyDocument('global', globalPolicyXml)
const referenceApi = parsePolicyDocument('api', apiPolicyXml)

function element(xml: string): XmlElement {
  const result = parseXml(xml)
  if (!result.ok) throw new Error(result.error)
  return result.root
}

describe('parseXml', () => {
  it('keeps attribute and text values as strings, in document order', () => {
    const root = element('<a code="401"><b>123</b><c /><b>x</b></a>')
    expect(root.attributes).toEqual({ code: '401' })
    expect(childElements(root).map((child) => child.name)).toEqual(['b', 'c', 'b'])
    expect(childElements(root)[0]?.children).toEqual([{ text: '123' }])
  })

  it('reports invalid XML instead of guessing', () => {
    const result = parseXml('<policies><inbound></policies>')
    expect(result).toMatchObject({ ok: false })
    expect(!result.ok && result.error).toMatch(/^Invalid XML at line 1/)
  })

  it('serializes an element back to escaped XML for review snippets', () => {
    const xml = toXml(
      element(
        '<choose><when condition="@(a &lt; b &amp;&amp; c == &quot;x&quot;)"><x /></when></choose>',
      ),
    )
    expect(xml).toBe(
      '<choose>\n  <when condition="@(a &lt; b &amp;&amp; c == &quot;x&quot;)">\n    <x />\n  </when>\n</choose>',
    )
  })
})

describe('parsePolicyDocument', () => {
  it('finds the four sections', () => {
    expect(referenceApi.parsed.ok && Object.keys(referenceApi.parsed.sections)).toEqual([
      'inbound',
      'backend',
      'outbound',
      'on-error',
    ])
  })

  it('rejects a document whose root is not <policies>', () => {
    expect(parsePolicyDocument('api', '<inbound />').parsed).toEqual({
      ok: false,
      error: 'Root element is not <policies>.',
    })
  })
})

describe('composeSection', () => {
  const section = (xml: string) => element(`<inbound>${xml}</inbound>`)
  const names = (result: ReturnType<typeof composeSection>) =>
    result.elements.map(({ scope, element: e }) => `${scope}:${e.name}`)

  it('replaces <base /> with the parent, keeping elements before and after it', () => {
    const result = composeSection([
      { scope: 'global', section: section('<cors />') },
      { scope: 'api', section: section('<x /><base /><y />') },
      { scope: 'operation', section: section('<base /><z />') },
    ])
    expect(names(result)).toEqual(['api:x', 'global:cors', 'api:y', 'operation:z'])
    expect(result.withoutBase).toEqual([])
  })

  it('drops the parent when a section has no <base />, and records where', () => {
    const result = composeSection([
      { scope: 'global', section: section('<cors />') },
      { scope: 'api', section: section('<x />') },
    ])
    expect(names(result)).toEqual(['api:x'])
    expect(result.withoutBase).toEqual(['api'])
  })

  it('inherits unchanged through a scope that does not define the section', () => {
    const result = composeSection([
      { scope: 'global', section: section('<cors />') },
      { scope: 'api', section: undefined },
      { scope: 'operation', section: section('<base /><z />') },
    ])
    expect(names(result)).toEqual(['global:cors', 'operation:z'])
  })
})

describe('analyzeOperationPolicy: the reference policy', () => {
  const analyzed = analyzeOperationPolicy('list-orders', { global, api: referenceApi })

  it('extracts validate-jwt, set-backend-service and authentication-managed-identity', () => {
    const source = { scope: 'api', section: 'inbound' }
    expect(analyzed.rules).toEqual([
      {
        kind: 'validate-jwt',
        source,
        headerName: 'Authorization',
        openIdConfigUrls: [
          'https://login.microsoftonline.com/00000000-0000-0000-0000-0000000000aa/v2.0/.well-known/openid-configuration',
        ],
        audiences: ['api://orders-api.contoso.example.net'],
        issuers: [
          'https://sts.windows.net/00000000-0000-0000-0000-0000000000aa/',
          'https://login.microsoftonline.com/00000000-0000-0000-0000-0000000000aa/v2.0',
        ],
        requiredClaims: [{ name: 'roles', match: 'any', values: ['Orders.Read', 'Orders.Write'] }],
      },
      { kind: 'set-backend-service', source, backendId: 'orders-backend' },
      {
        kind: 'authentication-managed-identity',
        source,
        resource: 'api://orders-backend.contoso.example.net',
        clientId: '00000000-0000-0000-0000-000000000011',
      },
    ])
  })

  it('records that the API inbound drops the global inbound (no <base />)', () => {
    expect(analyzed.droppedParents).toEqual([{ section: 'inbound', scope: 'api' }])
  })

  it('leaves nothing unresolved: outbound and on-error expressions are not analyzed', () => {
    // The reference outbound uses @(context.RequestId…) and on-error builds a body with @{…}.
    expect(analyzed.unresolved).toEqual([])
  })

  it('composes an operation policy on top, ignoring its rate-limit', () => {
    const withOperation = analyzeOperationPolicy('create-order', {
      global,
      api: referenceApi,
      operation: parsePolicyDocument('operation', createOrderPolicyXml, 'create-order'),
    })
    expect(withOperation.rules.map((rule) => rule.kind)).toEqual([
      'validate-jwt',
      'set-backend-service',
      'authentication-managed-identity',
    ])
    expect(withOperation.unresolved).toEqual([])
  })

  it('has no rules for an operation with no policy at any scope', () => {
    expect(analyzeOperationPolicy('x', {})).toEqual({
      operationId: 'x',
      rules: [],
      unresolved: [],
      droppedParents: [],
    })
  })
})

describe('analyzeOperationPolicy: outside the pattern', () => {
  const analyzeApi = (inbound: string, backend?: string) =>
    analyzeOperationPolicy('op', { api: parsePolicyDocument('api', policy(inbound, backend)) })

  it.each([
    ['<choose><when condition="@(true)"><base /></when></choose>', 'choose'],
    ['<include-fragment fragment-id="auth" />', 'include-fragment'],
    ['<validate-azure-ad-token tenant-id="t" />', 'validate-azure-ad-token'],
    ['<send-request mode="new" response-variable-name="r" />', 'send-request'],
    ['<set-backend-service base-url="https://x.example.net" />', 'set-backend-service'],
    [
      '<set-backend-service backend-id="@(context.Variables[&quot;b&quot;])" />',
      'set-backend-service',
    ],
    ['<set-backend-service backend-id="{{orders-backend}}" />', 'set-backend-service'],
    [
      '<set-header name="Authorization" exists-action="override"><value>x</value></set-header>',
      'set-header',
    ],
    [
      '<authentication-managed-identity resource="api://r" output-token-variable-name="t" />',
      'authentication-managed-identity',
    ],
    [
      '<validate-jwt><audiences><audience>{{api-audience}}</audience></audiences></validate-jwt>',
      'validate-jwt',
    ],
  ])('flags %s for manual review, with its XML', (inbound, name) => {
    const { rules, unresolved } = analyzeApi(inbound)
    expect(rules).toEqual([])
    expect(unresolved).toHaveLength(1)
    expect(unresolved[0]).toMatchObject({
      source: { scope: 'api', section: 'inbound' },
      element: name,
    })
    expect(unresolved[0]?.xml).toContain(`<${name}`)
    expect(unresolved[0]?.reason).not.toBe('')
  })

  it('flags unknown elements in the backend section too', () => {
    const { unresolved } = analyzeApi('', '<retry count="3"><forward-request /></retry>')
    expect(unresolved).toMatchObject([{ source: { section: 'backend' }, element: 'retry' }])
  })

  it('ignores response-only and throttling elements', () => {
    const { rules, unresolved } = analyzeApi(
      '<cors /><rate-limit calls="1" renewal-period="1" /><quota calls="1" renewal-period="1" /><set-header name="X-Trace" exists-action="delete" />',
      '<forward-request />',
    )
    expect(rules).toEqual([])
    expect(unresolved).toEqual([])
  })

  it('allows an expression in the caller-facing error message of validate-jwt', () => {
    const { rules, unresolved } = analyzeApi(
      '<validate-jwt failed-validation-error-message="@(&quot;no&quot;)"><audiences><audience>api://a</audience></audiences></validate-jwt>',
    )
    expect(unresolved).toEqual([])
    expect(rules).toMatchObject([{ kind: 'validate-jwt', audiences: ['api://a'] }])
  })

  it("uses APIM's default match=all for required claims", () => {
    const { rules } = analyzeApi(
      '<validate-jwt><required-claims><claim name="roles"><value>A</value></claim></required-claims></validate-jwt>',
    )
    expect(rules).toMatchObject([
      { requiredClaims: [{ name: 'roles', match: 'all', values: ['A'] }] },
    ])
  })

  it('keeps every set-backend-service in order, so the last one can win', () => {
    const { rules } = analyzeApi(
      '<set-backend-service backend-id="first" /><set-backend-service backend-id="second" />',
    )
    expect(rules.map((rule) => rule.kind === 'set-backend-service' && rule.backendId)).toEqual([
      'first',
      'second',
    ])
  })

  it('reports an unreadable document as unresolved instead of skipping it', () => {
    const documents: OperationDocuments = {
      global,
      api: parsePolicyDocument('api', '<policies><inbound></policies>'),
    }
    const { unresolved } = analyzeOperationPolicy('op', documents)
    expect(unresolved).toMatchObject([{ element: 'policies', source: { scope: 'api' } }])
    expect(unresolved[0]?.reason).toContain('could not be read')
  })
})
