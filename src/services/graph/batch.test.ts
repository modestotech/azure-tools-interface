import { http, HttpResponse } from 'msw'
import { z } from 'zod'
import { GRAPH_BATCH_URL } from '@/lib/http'
import { REPORTING_MI_SP, WEBSHOP_SP } from '@/test/fixtures/graph'
import { testClient } from '@/test/helpers/testClient'
import { resolveGraph } from '@/test/msw/graph'
import { GRAPH } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { getServicePrincipalsByIds, subResponseResult } from './batch'

const UNKNOWN_GUID = '00000000-0000-0000-0000-000000000999'
const guid = (n: number) => `00000000-0000-0000-0000-${String(1000 + n).padStart(12, '0')}`

describe('getServicePrincipalsByIds', () => {
  it('looks up each distinct ID in one $batch, with a result per ID', async () => {
    const { client, log } = testClient()
    const result = await getServicePrincipalsByIds(client, [
      WEBSHOP_SP.id,
      REPORTING_MI_SP.id,
      UNKNOWN_GUID,
      WEBSHOP_SP.id,
    ])
    if (result.status !== 'ok') throw new Error(`expected ok, got ${result.status}`)

    expect([...result.data.keys()]).toEqual([WEBSHOP_SP.id, REPORTING_MI_SP.id, UNKNOWN_GUID])
    expect(result.data.get(WEBSHOP_SP.id)).toMatchObject({
      status: 'ok',
      data: { appId: WEBSHOP_SP.appId, servicePrincipalType: 'Application' },
    })
    expect(result.data.get(REPORTING_MI_SP.id)).toMatchObject({
      status: 'ok',
      data: { servicePrincipalType: 'ManagedIdentity' },
    })
    expect(result.data.get(UNKNOWN_GUID)).toEqual({ status: 'empty' })
    expect(log.getState().entries.map((entry) => entry.label)).toEqual(['$batch ×3 · 1 failed'])
  })

  it('chunks more than 20 lookups into several POSTs', async () => {
    const { client, log } = testClient()
    const ids = Array.from({ length: 25 }, (_, i) => guid(i))
    const result = await getServicePrincipalsByIds(client, ids)
    expect(result.status === 'ok' && result.data.size).toBe(25)
    expect(log.getState().entries).toHaveLength(2)
  })

  it('keeps the results of the other POSTs when one POST fails', async () => {
    // A full chunk of 20 fails with a 500; the last 5 lookups go in a POST of their own.
    server.use(
      http.post(GRAPH_BATCH_URL, async ({ request }) => {
        const { requests } = (await request.json()) as { requests: { id: string; url: string }[] }
        if (requests.length === 20) {
          return HttpResponse.json({ error: { code: 'InternalServerError' } }, { status: 500 })
        }
        return HttpResponse.json({
          responses: requests.map(({ id, url }) => ({
            id,
            ...resolveGraph(new URL(`${GRAPH}${url}`)),
          })),
        })
      }),
    )
    const { client } = testClient()
    const ids = Array.from({ length: 25 }, (_, i) => guid(i))
    const result = await getServicePrincipalsByIds(client, ids)
    if (result.status !== 'ok') throw new Error(`expected ok, got ${result.status}`)

    expect(result.data.size).toBe(25)
    for (const id of ids.slice(0, 20)) {
      expect(result.data.get(id)).toMatchObject({
        status: 'error',
        error: { kind: 'unexpected-status', status: 500 },
      })
    }
    for (const id of ids.slice(20)) expect(result.data.get(id)).toEqual({ status: 'empty' })
  })

  it('sends nothing for no IDs, and refuses the whole batch if one ID is invalid', async () => {
    const { client, log } = testClient()
    const none = await getServicePrincipalsByIds(client, [])
    expect(none.status === 'ok' && none.data.size).toBe(0)

    const refused = await getServicePrincipalsByIds(client, [WEBSHOP_SP.id, '../me'])
    expect(refused).toMatchObject({ status: 'error', error: { kind: 'invalid-request' } })
    expect(log.getState().entries).toHaveLength(0)
  })
})

describe('subResponseResult', () => {
  const schema = z.object({ id: z.string() })
  const url = 'https://graph.example.net/v1.0/groups/1'

  it('validates a 2xx body, and reports a mismatch as invalid-response', () => {
    expect(subResponseResult({ id: '0', status: 200, body: { id: 'g' } }, url, schema)).toEqual({
      status: 'ok',
      data: { id: 'g' },
    })
    expect(subResponseResult({ id: '0', status: 200, body: {} }, url, schema)).toMatchObject({
      status: 'error',
      error: { kind: 'invalid-response', status: 200, url },
    })
  })

  it("maps statuses to results, quoting Graph's error code but never its message", () => {
    const denied = {
      id: '0',
      status: 403,
      body: { error: { code: 'Authorization_RequestDenied', message: 'user alice@contoso…' } },
    }
    const forbidden = subResponseResult(denied, url, schema)
    expect(forbidden).toMatchObject({ status: 'forbidden', error: { kind: 'forbidden' } })
    expect(forbidden.status === 'forbidden' && forbidden.error.message).toContain(
      'Authorization_RequestDenied',
    )
    expect(forbidden.status === 'forbidden' && forbidden.error.message).not.toContain('alice')

    expect(subResponseResult({ id: '0', status: 404, body: {} }, url, schema)).toEqual({
      status: 'empty',
    })
    expect(subResponseResult({ id: '0', status: 429, body: {} }, url, schema)).toMatchObject({
      error: { kind: 'throttled' },
    })
    expect(subResponseResult({ id: '0', status: 500, body: null }, url, schema)).toMatchObject({
      status: 'error',
      error: { kind: 'unexpected-status', status: 500 },
    })
  })
})
