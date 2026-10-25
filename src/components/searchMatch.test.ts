import { matchesSearch } from './searchMatch'

const API = 'apim0002-orepay-transaction-data-v1 APIM0002 - Orepay Transaction Data V1 (/orepay)'

describe('matchesSearch', () => {
  it('matches anywhere, ignoring case', () => {
    expect(matchesSearch(API, '02')).toBe(true)
    expect(matchesSearch(API, 'OREPAY')).toBe(true)
    expect(matchesSearch(API, '0003')).toBe(false)
  })

  it('treats * as any run of characters', () => {
    expect(matchesSearch(API, 'apim*orepay')).toBe(true)
    expect(matchesSearch(API, '*transaction*v1')).toBe(true)
    expect(matchesSearch(API, 'orepay*0003')).toBe(false)
  })

  it('takes other characters literally', () => {
    expect(matchesSearch(API, '(/orepay)')).toBe(true)
    expect(matchesSearch(API, 'v.')).toBe(false)
    expect(matchesSearch('a+b', 'a+b')).toBe(true)
  })

  it('matches everything for an empty search', () => {
    expect(matchesSearch(API, '  ')).toBe(true)
  })
})
