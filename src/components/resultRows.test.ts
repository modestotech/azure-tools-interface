import { cellText, compareValues, exportRows } from './resultRows'

describe('result rows', () => {
  it('shows booleans as yes/no and leaves missing values empty', () => {
    expect([true, false, undefined, 3, 'x'].map(cellText)).toEqual(['yes', 'no', '', '3', 'x'])
  })

  it('sorts numbers by value, text alphabetically, empty cells last', () => {
    expect([10, 9, undefined, 2].sort(compareValues)).toEqual([2, 9, 10, undefined])
    expect(['b', undefined, 'a'].sort(compareValues)).toEqual(['a', 'b', undefined])
  })

  it('exports in column order, as strings and numbers', () => {
    const columns = [
      { key: 'b', title: 'B' },
      { key: 'a', title: 'A' },
    ]
    expect(exportRows(columns, [{ a: true, b: 2, extra: 'dropped' }])).toEqual([{ b: 2, a: 'yes' }])
  })
})
