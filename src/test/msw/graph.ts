import { http, HttpResponse } from 'msw'
import { GRAPH_BATCH_URL } from '@/lib/http'
import { API_RESOURCES } from '@/lib/token'
import { graphFixtures } from '@/test/fixtures/graph'

/**
 * Graph v1.0 over the fictional fixtures. One resolver answers both plain GETs and `$batch`
 * sub-requests, so the two behave the same. `$select` is ignored; member lists page by two.
 */

const GRAPH = API_RESOURCES.graph.baseUrl
const MEMBER_PAGE_SIZE = 2

interface GraphAnswer {
  status: number
  body: unknown
}

const ok = (body: unknown): GraphAnswer => ({ status: 200, body })

const graphError = (status: number, code: string): GraphAnswer => ({
  status,
  body: { error: { code, message: `${code} (fictional)` } },
})

const notFound = () => graphError(404, 'Request_ResourceNotFound')

const byId = <T extends { id: string }>(items: readonly T[], id: string | undefined) =>
  items.find((item) => item.id === id)

const found = (item: unknown) => (item === undefined ? notFound() : ok(item))

const list = (value: readonly unknown[] | undefined) => (value ? ok({ value }) : notFound())

/** The literal in `servicePrincipalNames/any(x:x eq '…')`, with OData's doubled quotes undone. */
function filteredName(filter: string | null): string | undefined {
  const literal = /^servicePrincipalNames\/any\(x:x eq '((?:[^']|'')*)'\)$/.exec(filter ?? '')?.[1]
  return literal?.replace(/''/g, "'")
}

function pagedMembers(url: URL, groupId: string | undefined): GraphAnswer {
  const members = graphFixtures.groupMembers[groupId ?? '']
  if (!members) return notFound()
  const offset = Number(url.searchParams.get('$skiptoken') ?? '0')
  const next = offset + MEMBER_PAGE_SIZE
  return ok({
    value: members.slice(offset, next),
    ...(next < members.length
      ? {
          '@odata.nextLink': `${GRAPH}/groups/${String(groupId)}/members?$skiptoken=${String(next)}`,
        }
      : {}),
  })
}

const ROUTES: readonly [RegExp, (match: RegExpExecArray, url: URL) => GraphAnswer][] = [
  [
    /^\/servicePrincipals\(appId='([^']+)'\)$/,
    ([, appId]) => found(graphFixtures.servicePrincipals.find((sp) => sp.appId === appId)),
  ],
  [
    /^\/servicePrincipals$/,
    (_, url) => {
      const name = filteredName(url.searchParams.get('$filter'))
      if (name === undefined) return graphError(400, 'Request_UnsupportedQuery')
      return list(
        graphFixtures.servicePrincipals.filter((sp) => sp.servicePrincipalNames.includes(name)),
      )
    },
  ],
  [/^\/servicePrincipals\/([^/]+)$/, ([, id]) => found(byId(graphFixtures.servicePrincipals, id))],
  [
    /^\/servicePrincipals\/([^/]+)\/appRoleAssignedTo$/,
    ([, id]) =>
      list(
        byId(graphFixtures.servicePrincipals, id) &&
          (graphFixtures.appRoleAssignedTo[id ?? ''] ?? []),
      ),
  ],
  [
    /^\/servicePrincipals\/([^/]+)\/appRoleAssignments$/,
    ([, id]) =>
      list(
        byId(graphFixtures.servicePrincipals, id) &&
          (graphFixtures.appRoleAssignments[id ?? ''] ?? []),
      ),
  ],
  [/^\/groups\/([^/]+)$/, ([, id]) => found(byId(graphFixtures.groups, id))],
  [/^\/groups\/([^/]+)\/members$/, ([, id], url) => pagedMembers(url, id)],
]

/** Answers one Graph GET from the fixtures. Unknown routes are a 400, so a test notices. */
export function resolveGraph(url: URL): GraphAnswer {
  const path = decodeURIComponent(url.pathname.replace(/^\/v1\.0/, ''))
  for (const [pattern, answer] of ROUTES) {
    const match = pattern.exec(path)
    if (match) return answer(match, url)
  }
  return graphError(400, 'Request_UnsupportedQuery')
}

interface BatchBody {
  requests: { id: string; url: string }[]
}

export const graphHandlers = [
  http.post(GRAPH_BATCH_URL, async ({ request }) => {
    const { requests } = (await request.json()) as BatchBody
    return HttpResponse.json({
      responses: requests.map(({ id, url }) => {
        const { status, body } = resolveGraph(new URL(`${GRAPH}${url}`))
        return { id, status, headers: { 'Content-Type': 'application/json' }, body }
      }),
    })
  }),
  http.get(new RegExp(`^${GRAPH.replace(/[.]/g, '\\.')}/`), ({ request }) => {
    const { status, body } = resolveGraph(new URL(request.url))
    return new HttpResponse(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }),
]
