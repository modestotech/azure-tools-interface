import { http, HttpResponse } from 'msw'
import { API_RESOURCES } from '@/lib/token'
import { APIM_API_VERSION, SUBSCRIPTIONS_API_VERSION } from '@/services/arm/apiVersion'
import { armFixtures, SERVICE_NAME } from '@/test/fixtures/arm'

export const ARM = API_RESOURCES.arm.baseUrl
export const GRAPH = API_RESOURCES.graph.baseUrl

const SERVICE = `${ARM}/subscriptions/:sub/resourceGroups/:rg/providers/Microsoft.ApiManagement/service/:svc`

function armError(status: number, code: string) {
  return HttpResponse.json({ error: { code, message: `${code} (fictional)` } }, { status })
}

const notFound = () => armError(404, 'ResourceNotFound')

/** Reads one path parameter. Every route here has single-segment parameters. */
type Param = (name: string) => string

/**
 * An ARM GET handler that answers 400 unless the request carries `apiVersion` (and, for policies,
 * `format=rawxml`), the way ARM rejects a wrong version. `resolve` returns the body, or undefined
 * for a 404.
 */
function armGet(
  path: string,
  apiVersion: string,
  resolve: (param: Param) => unknown,
  query: Readonly<Record<string, string>> = {},
) {
  return http.get(path, ({ request, params }) => {
    const search = new URL(request.url).searchParams
    if (search.get('api-version') !== apiVersion) return armError(400, 'InvalidApiVersionParameter')
    for (const [key, value] of Object.entries(query)) {
      if (search.get(key) !== value) return armError(400, 'InvalidQueryParameter')
    }
    const body = resolve((name) => String(params[name]))
    return body === undefined ? notFound() : HttpResponse.json(body)
  })
}

/** The fictional service, if the request names it. */
const known = (param: Param) => param('svc') === SERVICE_NAME

const list = (value: readonly unknown[]) => ({ value })

const RAW_XML = { format: 'rawxml' }

/** Fictional data only (`test/fixtures/`), for tests and `pnpm dev:demo`. */
export const handlers = [
  armGet(`${ARM}/subscriptions`, SUBSCRIPTIONS_API_VERSION, () => list(armFixtures.subscriptions)),
  armGet(
    `${ARM}/subscriptions/:sub/providers/Microsoft.ApiManagement/service`,
    APIM_API_VERSION,
    (param) =>
      list(armFixtures.services.filter((s) => s.id.startsWith(`/subscriptions/${param('sub')}/`))),
  ),
  armGet(SERVICE, APIM_API_VERSION, (param) =>
    known(param) ? armFixtures.services[0] : undefined,
  ),
  armGet(`${SERVICE}/apis`, APIM_API_VERSION, (param) =>
    known(param) ? list(armFixtures.apis) : undefined,
  ),
  armGet(
    `${SERVICE}/policies/policy`,
    APIM_API_VERSION,
    (param) => (known(param) ? armFixtures.globalPolicy : undefined),
    RAW_XML,
  ),
  armGet(`${SERVICE}/apis/:apiId/operations`, APIM_API_VERSION, (param) => {
    const operations = known(param) ? armFixtures.operations[param('apiId')] : undefined
    return operations && list(operations)
  }),
  armGet(
    `${SERVICE}/apis/:apiId/policies/policy`,
    APIM_API_VERSION,
    (param) => (known(param) ? armFixtures.apiPolicies[param('apiId')] : undefined),
    RAW_XML,
  ),
  armGet(
    `${SERVICE}/apis/:apiId/operations/:opId/policies/policy`,
    APIM_API_VERSION,
    (param) =>
      known(param)
        ? armFixtures.operationPolicies[`${param('apiId')}/${param('opId')}`]
        : undefined,
    RAW_XML,
  ),
  armGet(`${SERVICE}/backends/:backendId`, APIM_API_VERSION, (param) =>
    known(param) ? armFixtures.backends[param('backendId')] : undefined,
  ),
]
