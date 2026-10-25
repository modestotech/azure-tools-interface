import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { requestLogStore } from '@/lib/http'
import { TEST_SUB } from '@/test/helpers/fakeJwt'
import { stubElementSize } from '@/test/helpers/layout'
import { AppProviders } from '../AppProviders'
import { sessionStore } from '../session/sessionStore'
import { AppShell } from './AppShell'
import { DemoBanner } from './DemoBanner'
import { uiStore } from './uiStore'

function renderShell() {
  const user = userEvent.setup()
  render(
    <AppProviders>
      <AppShell />
    </AppProviders>,
  )
  return user
}

describe('AppShell', () => {
  it('starts with session and scope open, and an Overview generated from the registry', () => {
    renderShell()
    expect(screen.getByText('Session and scope').closest('details')).toHaveAttribute('open')
    expect(screen.getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
    expect(
      screen.getByText(/Choose a subscription, an APIM instance and an API/),
    ).toBeInTheDocument()
  })

  it('docks the request log with masked lines and counters, and folds it', async () => {
    stubElementSize()
    sessionStore.getState().setSubscriptionId(TEST_SUB)
    const log = requestLogStore.getState()
    const id = log.start({
      api: 'arm',
      method: 'GET',
      url: '/subscriptions/{sub}/x',
      rawUrl: `/subscriptions/${TEST_SUB}/x`,
    })
    log.finish(id, { state: 'ok', status: 200, bytes: 10 })
    const user = renderShell()

    const dock = screen.getByRole('region', { name: 'Request log' })
    expect(dock).toHaveTextContent('1 done')
    expect(dock).toHaveTextContent('GET 200')
    expect(dock).toHaveTextContent('/subscriptions/{sub}/x')
    expect(dock).not.toHaveTextContent(TEST_SUB)

    await user.click(screen.getByRole('button', { name: /requests:/ }))
    expect(uiStore.getState().logOpen).toBe(false)
    expect(dock).not.toHaveTextContent('GET 200')
  })
})

describe('DemoBanner', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is absent outside demo mode', () => {
    const { container } = render(<DemoBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('warns about fictional data and fills in demo tokens', async () => {
    vi.stubEnv('MODE', 'demo')
    const user = userEvent.setup()
    render(<DemoBanner />)
    expect(screen.getByText(/fictional data/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Fill in demo tokens' }))
    await waitFor(() => {
      expect(sessionStore.getState().tokens.graph).not.toBe('')
    })
    expect(sessionStore.getState().tokens.arm).not.toBe('')
    expect(sessionStore.getState().tenantId).not.toBe('')
  })
})
