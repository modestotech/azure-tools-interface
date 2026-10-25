import { csvField, toCsv } from './download'

describe('toCsv', () => {
  it('writes a header row and quotes fields that need it', () => {
    expect(toCsv([{ name: 'a, b', note: 'say "hi"', count: 2 }])).toBe(
      'name,note,count\r\n"a, b","say ""hi""",2\r\n',
    )
    expect(toCsv([])).toBe('')
  })

  it('stops values from policy XML or Entra from running as spreadsheet formulas', () => {
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvField('+1')).toBe("'+1")
    expect(csvField('@sum')).toBe("'@sum")
    expect(csvField('-1')).toBe("'-1")
    expect(csvField(-1)).toBe('-1')
    expect(csvField('/orders')).toBe('/orders')
  })
})
