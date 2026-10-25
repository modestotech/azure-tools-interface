import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buildAccessModel } from '@/domain'
import { fixtureInputs } from '@/test/fixtures/accessModel'
import { stubElementSize } from '@/test/helpers/layout'
import PrincipalExplorer from './PrincipalExplorer'

function renderExplorer() {
  stubElementSize(1200, 600)
  render(<PrincipalExplorer model={buildAccessModel(fixtureInputs())} />)
  return userEvent.setup()
}

const option = (name: RegExp) => screen.getByRole('option', { name })

describe('PrincipalExplorer', () => {
  it('lists every principal with how many operations it reaches', () => {
    renderExplorer()
    expect(screen.getAllByRole('option')).toHaveLength(5)
    expect(option(/Contoso Webshop/)).toHaveTextContent('calls 2')
    expect(option(/Orders Readers/)).toHaveTextContent('grants 2')
    // The managed identity is in the group, but group roles don't reach it.
    expect(option(/id-contoso-reporting/)).toHaveTextContent('calls 0')
  })

  it('filters by name, ID or type', async () => {
    const user = renderExplorer()
    await user.type(screen.getByRole('textbox', { name: 'Filter principals' }), 'user')
    expect(screen.getAllByRole('option').map((item) => item.textContent)).toEqual([
      expect.stringContaining('Alice Andersson'),
      expect.stringContaining('Bob Berg'),
    ])
  })

  it('explains why a user can call, through a group', async () => {
    const user = renderExplorer()
    await user.click(option(/Alice Andersson/))
    const details = screen.getByRole('region', { name: 'Details of Alice Andersson' })
    expect(
      within(details).getAllByText('member of Orders Readers, which holds Orders.Read'),
    ).toHaveLength(2)
  })

  it('shows a group’s direct members, with the ineffective one marked', async () => {
    const user = renderExplorer()
    await user.click(option(/Orders Readers/))
    const details = screen.getByRole('region', { name: 'Details of Orders Readers' })
    expect(within(details).getByText(/id-contoso-reporting.*not effective/)).toBeInTheDocument()
  })
})
