import { fireEvent, render, screen, within } from '@testing-library/react'
import { buildAccessModel } from '@/domain'
import { fixtureInputs } from '@/test/fixtures/accessModel'
import { largeTenantInputs } from '@/test/fixtures/largeTenant'
import { stubElementSize } from '@/test/helpers/layout'
import AccessGraph, { MAX_DRAWN_EDGES } from './AccessGraph'
import { layoutGraph } from './layout'

vi.mock('./layout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./layout')>()
  return { ...actual, layoutGraph: vi.fn(actual.layoutGraph) }
})

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

  it('draws only the operations matching the filter', async () => {
    renderGraph()
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter operations' }), {
      target: { value: 'post' },
    })
    expect(await screen.findByText('POST /orders')).toBeInTheDocument()
    expect(screen.queryByText('GET /orders')).not.toBeInTheDocument()
  })

  it('asks for a filter instead of drawing a graph that is too large', () => {
    stubElementSize(1200, 600)
    const size = { operations: 20, users: 100, apps: 0, groups: 0, membersPerGroup: 0 }
    expect(size.operations * size.users).toBeGreaterThan(MAX_DRAWN_EDGES)
    render(<AccessGraph model={buildAccessModel(largeTenantInputs(size))} />)
    expect(screen.getByRole('status')).toHaveTextContent(/too many to draw/)
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter operations' }), {
      target: { value: '/things/15' },
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    // 100 users, the one operation and its backend.
    expect(screen.getByText(/102 nodes, 101 edges/)).toBeInTheDocument()
  })

  it('says so when the layout fails, and lays out again on request', async () => {
    vi.mocked(layoutGraph).mockRejectedValueOnce(new Error('elk failed'))
    renderGraph()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/layout failed/)
    expect(screen.queryByText(/loading…/)).not.toBeInTheDocument()
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Contoso Webshop')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
