/**
 * The parser runs in the browser, which has no Node `Buffer`. Tests run in Node, where it exists,
 * so this test removes it and loads the parser and its XML libraries afresh.
 */
describe('the policy parser without Node globals', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads and parses with no Buffer', async () => {
    vi.stubGlobal('Buffer', undefined)
    vi.resetModules()
    const { parseXml } = await import('./xmlTree')
    expect(parseXml('<policies><inbound><base /></inbound></policies>').ok).toBe(true)
    expect(parseXml('<policies><inbound></policies>').ok).toBe(false)
  })
})
