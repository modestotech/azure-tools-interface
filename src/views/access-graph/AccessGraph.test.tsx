import { fireEvent, render, screen, within } from '@testing-library/react'
import { buildAccessModel } from '@/domain'
import { fixtureInputs } from '@/test/fixtures/accessModel'
import { stubElementSize } from '@/test/helpers/layout'
import AccessGraph from './AccessGraph'

/*
 * fireEvent rather than user-event: user-event's mousedown has no `view`, which d3-zoom (under
 * React Flow's pane) reads. React Flow also keeps nodes `visibility: hidden` until it has measured
 * them, which jsdom never does, so nodes are found by text rather than by role.
 */
function renderGraph() {
  stubElementSize(1200, 600)
  render(<AccessGraph model={buildAccessModel(fixtureInputs())} />)
}

describe('AccessGraph', () => {
  it('draws role holders, operations and backends once laid out', async () => {
    renderGraph()
    expect(await screen.findByText('Contoso Webshop')).toBeInTheDocument()
    expect(screen.getByText('GET /orders')).toBeInTheDocument()
    expect(screen.getByText('Orders service')).toBeInTheDocument()
    expect(screen.queryByText('Alice Andersson')).not.toBeInTheDocument()
  })

  it('shows a group’s direct members on request', async () => {
    renderGraph()
    fireEvent.click(await screen.findByText('Show members'))
    expect(await screen.findByText('Alice Andersson')).toBeInTheDocument()
    expect(screen.getByText('id-contoso-reporting')).toBeInTheDocument()
    expect(screen.getByText('Hide members')).toBeInTheDocument()
  })

  it('shows the details of a selected node', async () => {
    renderGraph()
    fireEvent.click(await screen.findByText('Bob Berg'))
    const details = screen.getByRole('region', { name: 'Details of Bob Berg' })
    expect(within(details).getByText(/GET \/orders/)).toBeInTheDocument()
    expect(within(details).getAllByText(/holds Orders.Write/)).toHaveLength(2)
  })
})
