import { http, HttpResponse } from 'msw'
import { APIM_IDENTITY } from '@/test/fixtures/arm'
import {
  ALICE,
  ORDERS_API_SP,
  ORDERS_BACKEND_SP,
  ORDERS_READERS,
  REPORTING_MI_SP,
  ROLE,
} from '@/test/fixtures/graph'
import { testClient } from '@/test/helpers/testClient'
import { GRAPH } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import {
  findServicePrincipalsByName,
  findServicePrincipalsForAudience,
  getGroup,
  getServicePrincipalByAppId,
  getServicePrincipalById,
  listAppRoleAssignedTo,
  listAppRoleAssignments,
  listGroupMembers,
} from './entra'

const UNKNOWN_GUID = '00000000-0000-0000-0000-000000000999'

describe("the API's service principal", () => {
  it('is found by appId (GUID audience), with its app roles', async () => {
    const { client } = testClient()
    const result = await getServicePrincipalByAppId(client, ORDERS_API_SP.appId)
    expect(result.status === 'ok' && result.data.appRoles.map((role) => role.value)).toEqual([
      'Orders.Read',
      'Orders.Write',
    ])
    await expect(getServicePrincipalByAppId(client, UNKNOWN_GUID)).resolves.toEqual({
      status: 'empty',
    })
  })

  it('refuses an appId that is not a GUID, without sending anything', async () => {
    const { client, log } = testClient()
    const result = await getServicePrincipalByAppId(client, "x') or (appId='y")
    expect(result).toMatchObject({ status: 'error', error: { kind: 'invalid-request' } })
    expect(log.getState().entries).toHaveLength(0)
  })

  it('is found by servicePrincipalNames (api:// audience)', async () => {
    const { client } = testClient()
    const result = await findServicePrincipalsByName(client, 'api://orders-api.contoso.example.net')
    expect(result.status === 'ok' && result.data.map((sp) => sp.id)).toEqual([ORDERS_API_SP.id])
  })

  it('escapes quotes in the $filter value, so a policy value cannot alter the filter', async () => {
    const { client, log } = testClient()
    const result = await findServicePrincipalsByName(client, "api://x' or 1 eq 1 or 'a")
    // The handler parses the OData literal back: it's one name, which matches nothing.
    expect(result).toEqual({ status: 'ok', data: [] })
    expect(log.getState().entries[0]?.url).toContain(
      encodeURIComponent("'api://x'' or 1 eq 1 or ''a'"),
    )
  })
})

describe('findServicePrincipalsForAudience', () => {
  it('looks a GUID up as an appId and anything else by servicePrincipalNames, always as a list', async () => {
    const { client, log } = testClient()
    const byGuid = await findServicePrincipalsForAudience(client, ORDERS_API_SP.appId)
    const byName = await findServicePrincipalsForAudience(
      client,
      'api://orders-api.contoso.example.net',
    )
    expect(byGuid.status === 'ok' && byGuid.data.map((sp) => sp.id)).toEqual([ORDERS_API_SP.id])
    expect(byName.status === 'ok' && byName.data.map((sp) => sp.id)).toEqual([ORDERS_API_SP.id])
    const urls = log.getState().entries.map((entry) => entry.url)
    expect(urls[0]).toContain(`(appId='${ORDERS_API_SP.appId}')`)
    expect(urls[1]).toContain('servicePrincipalNames')
  })

  it('gives an empty list for an unknown GUID, not an error', async () => {
    const { client, log } = testClient()
    await expect(findServicePrincipalsForAudience(client, UNKNOWN_GUID)).resolves.toEqual({
      status: 'ok',
      data: [],
    })
    expect(log.getState().entries[0]?.state).toBe('empty')
  })
})

describe('inbound assignments and groups', () => {
  it('lists who holds app roles on the API', async () => {
    const { client } = testClient()
    const result = await listAppRoleAssignedTo(client, ORDERS_API_SP.id)
    expect(
      result.status === 'ok' &&
        result.data.map((a) => [a.principalType, a.principalDisplayName, a.appRoleId]),
    ).toEqual([
      ['ServicePrincipal', 'Contoso Webshop', ROLE.ordersRead],
      ['Group', 'Orders Readers', ROLE.ordersRead],
      ['User', 'Bob Berg', ROLE.ordersWrite],
    ])
  })

  it('reads a group, and lists its direct members across pages with nested groups removed', async () => {
    const { client, log } = testClient()
    const group = await getGroup(client, ORDERS_READERS.id)
    expect(group.status === 'ok' && group.data.displayName).toBe('Orders Readers')

    const members = await listGroupMembers(client, ORDERS_READERS.id)
    expect(members).toEqual({
      status: 'ok',
      data: [
        {
          kind: 'user',
          id: ALICE.id,
          displayName: ALICE.displayName,
          userPrincipalName: ALICE.userPrincipalName,
        },
        {
          kind: 'servicePrincipal',
          id: REPORTING_MI_SP.id,
          displayName: REPORTING_MI_SP.displayName,
          appId: REPORTING_MI_SP.appId,
          servicePrincipalType: 'ManagedIdentity',
        },
      ],
    })
    const urls = log.getState().entries.map((entry) => entry.url)
    expect(urls.filter((url) => url.includes('/members'))).toHaveLength(2)
    expect(urls.some((url) => url.includes('transitiveMembers'))).toBe(false)
  })

  it('refuses a group ID that would change the path, without sending anything', async () => {
    const { client, log } = testClient()
    await expect(listGroupMembers(client, '../users')).resolves.toMatchObject({
      status: 'error',
      error: { kind: 'invalid-request' },
    })
    expect(log.getState().entries).toHaveLength(0)
  })

  it('reports a forbidden call for that resource only', async () => {
    server.use(
      http.get(`${GRAPH}/servicePrincipals/:id/appRoleAssignedTo`, () =>
        HttpResponse.json({ error: { code: 'Authorization_RequestDenied' } }, { status: 403 }),
      ),
    )
    const { client } = testClient()
    await expect(listAppRoleAssignedTo(client, ORDERS_API_SP.id)).resolves.toMatchObject({
      status: 'forbidden',
    })
    await expect(getGroup(client, ORDERS_READERS.id)).resolves.toMatchObject({ status: 'ok' })
  })
})

describe("outbound: APIM's managed identity", () => {
  it('reads the identity and the app roles it holds on the backend', async () => {
    const { client } = testClient()
    const identity = await getServicePrincipalById(client, APIM_IDENTITY.principalId)
    expect(identity.status === 'ok' && identity.data).toMatchObject({
      appId: APIM_IDENTITY.clientId,
      servicePrincipalType: 'ManagedIdentity',
    })

    const assignments = await listAppRoleAssignments(client, APIM_IDENTITY.principalId)
    expect(assignments).toEqual({
      status: 'ok',
      data: [
        expect.objectContaining({
          appRoleId: ROLE.backendInvoke,
          resourceId: ORDERS_BACKEND_SP.id,
        }),
      ],
    })
  })
})
