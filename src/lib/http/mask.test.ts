import { TEST_SUB, TEST_TENANT } from '@/test/helpers/fakeJwt'
import { maskText } from './mask'

describe('maskText', () => {
  const values = { subscriptionId: TEST_SUB, tenantId: TEST_TENANT }

  it('masks the selected subscription and tenant', () => {
    const url = `https://management.azure.com/subscriptions/${TEST_SUB}/providers/x?tid=${TEST_TENANT}`
    expect(maskText(url, values)).toBe(
      'https://management.azure.com/subscriptions/{sub}/providers/x?tid={tid}',
    )
  })

  it('masks any /subscriptions/<guid> segment, even an unselected one, case-insensitively', () => {
    const other = '11111111-2222-3333-4444-555555555555'
    expect(maskText(`/subscriptions/${other.toUpperCase()}/x`, {})).toBe('/subscriptions/{sub}/x')
  })

  it('masks the IDs wherever they appear, e.g. in a query key', () => {
    expect(maskText(JSON.stringify(['arm', TEST_SUB, 'svc']), values)).toBe('["arm","{sub}","svc"]')
  })

  it('masks anything that looks like a JWT', () => {
    expect(maskText('Bearer eyJhbGciOi.eyJhdWQiOi.c2ln failed', {})).toBe('Bearer {token} failed')
  })

  it('follows changed IDs instead of reusing the previous ones', () => {
    const other = '00000000-0000-0000-0000-0000000000cc'
    expect(maskText(`t=${TEST_TENANT}`, values)).toBe('t={tid}')
    expect(maskText(`t=${TEST_TENANT}`, { tenantId: other })).toBe(`t=${TEST_TENANT}`)
    expect(maskText(`t=${other}`, { tenantId: other })).toBe('t={tid}')
  })

  it('leaves text alone when no IDs are set', () => {
    expect(maskText('/groups/abc', { subscriptionId: '', tenantId: undefined })).toBe('/groups/abc')
  })
})
