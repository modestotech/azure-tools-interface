import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buildAccessModel } from '@/domain'
import { fixtureInputs } from '@/test/fixtures/accessModel'
import { stubElementSize } from '@/test/helpers/layout'
import OperationsTable from './OperationsTable'

function renderTable() {
  stubElementSize(1200, 600)
  render(<OperationsTable model={buildAccessModel(fixtureInputs())} />)
  return userEvent.setup()
}

const bodyRows = () =>
  screen
    .getAllByRole('row')
    .filter((row) => row.closest('tbody') && row.getAttribute('aria-hidden') === null)

function bodyRow(index: number): HTMLElement {
  const row = bodyRows()[index]
  if (!row) throw new Error(`No row ${String(index)}`)
  return row
}

describe('OperationsTable', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists every operation with auth, callers, backend and outbound auth', () => {
    renderTable()
    expect(bodyRows()).toHaveLength(2)
    const first = within(bodyRow(0))
    expect(first.getByText('List orders')).toBeInTheDocument()
    expect(first.getByText(/roles \(any\): Orders.Read, Orders.Write/)).toBeInTheDocument()
    expect(first.getByText('https://ca-contoso-orders.example.net/api')).toBeInTheDocument()
    expect(first.getByText(/user-assigned identity →/)).toBeInTheDocument()
    expect(first.getByText('1 findings')).toBeInTheDocument()
    expect(screen.getByText('2 of 2 operations')).toBeInTheDocument()
  })

  it('filters by any text in the row', async () => {
    const user = renderTable()
    await user.type(screen.getByRole('textbox', { name: 'Filter operations' }), 'POST')
    expect(bodyRows()).toHaveLength(1)
    expect(screen.getByText('1 of 2 operations')).toBeInTheDocument()
  })

  it('sorts by a column', async () => {
    const user = renderTable()
    await user.click(screen.getByRole('button', { name: 'Method' }))
    await user.click(screen.getByRole('button', { name: 'Method' }))
    expect(within(bodyRow(0)).getByText('POST')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Method' })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
  })

  it('shows the selected operation with its findings', async () => {
    const user = renderTable()
    await user.click(bodyRow(1))
    const details = screen.getByRole('region', { name: 'Details of Create order' })
    expect(
      within(details).getByText(/global and product inbound policies are ignored/),
    ).toBeVisible()
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('region', { name: /Details of/ })).not.toBeInTheDocument()
  })

  it('exports the rows as CSV', async () => {
    const blobs: Blob[] = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      blobs.push(blob as Blob)
      return 'blob:operations'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const user = renderTable()
    await user.click(screen.getByRole('button', { name: 'CSV' }))
    const csv = (await blobs[0]?.text()) ?? ''
    expect(csv.split('\r\n')[0]).toBe(
      'method,path,name,auth,authScope,callers,backend,backendSource,outboundAuth,needsReview,findings',
    )
    expect(csv).toContain('GET,/orders,List orders')
  })
})
