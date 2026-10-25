import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buildAccessModel } from '@/domain'
import { fixtureInputs } from '@/test/fixtures/accessModel'
import { stubElementSize } from '@/test/helpers/layout'
import { Scripts } from './Scripts'
import { uiStore } from './uiStore'

function renderScripts() {
  stubElementSize(1200, 600)
  render(<Scripts model={buildAccessModel(fixtureInputs())} />)
  return userEvent.setup()
}

const bodyRows = (region: HTMLElement) =>
  within(region)
    .getAllByRole('row')
    .filter((row) => row.closest('tbody') && row.getAttribute('aria-hidden') === null)

describe('Scripts', () => {
  it('opens on the first script, and switches from the list', async () => {
    const user = renderScripts()
    expect(screen.getByRole('region', { name: 'Operations with no auth' })).toHaveTextContent(
      'Nothing found.',
    )
    await user.click(screen.getByRole('button', { name: 'Unresolved rules' }))
    expect(uiStore.getState().activeScriptId).toBe('unresolved-rules')
    expect(screen.getByRole('region', { name: 'Unresolved rules' })).toBeInTheDocument()
  })

  it('reruns a script when its parameter changes', async () => {
    uiStore.getState().openScript('broad-access')
    const user = renderScripts()
    const region = screen.getByRole('region', {
      name: 'Principals with access to more than N operations',
    })
    expect(bodyRows(region)).toHaveLength(3)
    const n = within(region).getByLabelText('More than N operations')
    await user.clear(n)
    await user.type(n, '2')
    expect(within(region).getByText('Nothing found.')).toBeInTheDocument()
  })

  it('shows the result as a sortable table', async () => {
    uiStore.getState().openScript('ineffective-members')
    const user = renderScripts()
    const region = screen.getByRole('region', { name: /ineffective app members/ })
    expect(within(bodyRows(region)[0] ?? region).getByText('id-contoso-reporting')).toBeVisible()
    await user.click(within(region).getByRole('button', { name: 'Group' }))
    expect(within(region).getByRole('columnheader', { name: 'Group' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
  })
})

describe('Scripts in ARM-only mode', () => {
  const renderArmOnly = () => {
    stubElementSize(1200, 600)
    render(<Scripts model={buildAccessModel({ ...fixtureInputs(), entra: false })} />)
  }

  it('does not run a script that needs Entra, and says why', () => {
    uiStore.getState().openScript('broad-access')
    renderArmOnly()
    const region = screen.getByRole('region', { name: /more than N operations/ })
    expect(within(region).getByRole('note')).toHaveTextContent(/reads principals and groups/)
    expect(within(region).queryByRole('table')).not.toBeInTheDocument()
  })

  it('runs the scripts that ARM data answers', () => {
    uiStore.getState().openScript('no-auth')
    renderArmOnly()
    expect(screen.getByRole('region', { name: 'Operations with no auth' })).toHaveTextContent(
      'Nothing found.',
    )
  })
})
