import { APIM_API_VERSION } from '@/services/arm/apiVersion'
import { logEntry as entry, LOG_SERVICE_URL as SERVICE } from '@/test/helpers/logEntry'
import { ARM, GRAPH } from '@/test/msw/handlers'
import { formatBytes, formatLine, shortUrl } from './format'

describe('formatBytes', () => {
  it('scales to B, kB and MB, and is empty while unknown', () => {
    expect(formatBytes(undefined)).toBe('')
    expect(formatBytes(512)).toBe('512B')
    expect(formatBytes(4200)).toBe('4.2kB')
    expect(formatBytes(1_300_000)).toBe('1.3MB')
  })
})

describe('shortUrl', () => {
  it('folds the ARM path up to the provider and drops the api-version', () => {
    expect(shortUrl('arm', `${SERVICE}/apis?api-version=${APIM_API_VERSION}`)).toBe(
      '…/service/apim/apis',
    )
    expect(shortUrl('arm', `${SERVICE}/policies/policy?format=rawxml&api-version=x`)).toBe(
      '…/service/apim/policies/policy?format=rawxml',
    )
    expect(shortUrl('arm', `${ARM}/subscriptions?api-version=x`)).toBe('/subscriptions')
  })

  it('drops the Graph base URL and decodes the query', () => {
    expect(
      shortUrl('graph', `${GRAPH}/servicePrincipals?%24filter=servicePrincipalNames%2Fany(x)`),
    ).toBe('/servicePrincipals?$filter=servicePrincipalNames/any(x)')
    expect(shortUrl('graph', `${GRAPH}/groups/%E0%A4%A`)).toBe('/groups/%E0%A4%A')
  })
})

describe('formatLine', () => {
  it('reads method, status, duration, size, source and path', () => {
    const line = entry()
    expect(formatLine(line, line.url)).toBe('GET 200 143ms 4.2kB arm …/service/apim/apis')
  })

  it('shows pending, retries, labels and the error kind', () => {
    const pending = entry({ state: 'pending', status: undefined, durationMs: undefined })
    expect(formatLine(pending, pending.url)).toBe('GET ... 4.2kB arm …/service/apim/apis')
    const failed = entry({ state: 'error', status: 403, errorKind: 'forbidden', retries: 2 })
    expect(formatLine(failed, failed.url)).toMatch(/^GET 403 .* ↻2 ✗ forbidden$/)
    const batch = entry({ api: 'graph', method: 'POST', url: `${GRAPH}/$batch`, label: '×3' })
    expect(formatLine(batch, batch.url)).toBe('POST 200 143ms 4.2kB graph /$batch ×3')
  })
})
