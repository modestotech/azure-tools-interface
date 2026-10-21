import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { requestLogStore } from '@/lib/http'
import { SERVICE_ID } from '@/test/fixtures/arm'
import { armToken, graphToken, TEST_SUB } from '@/test/helpers/fakeJwt'
import { ARM } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { AppProviders } from '../AppProviders'
import { selectionStore } from '../session/selectionStore'
import { sessionStore } from '../session/sessionStore'
import { AnalysisStatus } from './AnalysisStatus'
import { ScopePicker } from './ScopePicker'

function renderPicker() {
  const user = userEvent.setup()
  render(
    <AppProviders>
      <ScopePicker />
      <AnalysisStatus />
    </AppProviders>,
  )
  return user
}

const pick = (label: string) => screen.getByRole('combobox', { name: label })

/** Opens a picker and chooses the option with this name. */
async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: RegExp) {
  await user.click(pick(label))
  await user.click(await screen.findByRole('option', { name: option }))
}

describe('ScopePicker', () => {
  it('waits for an ARM token before listing anything', () => {
    renderPicker()
    expect(screen.getByText('Paste an ARM token first.')).toBeInTheDocument()
    expect(pick('Subscription')).toBeDisabled()
    expect(requestLogStore.getState().entries).toEqual([])
  })

  it('walks subscription → APIM instance → API, then runs the analysis', async () => {
    sessionStore.getState().setToken('arm', armToken())
    sessionStore.getState().setToken('graph', graphToken())
    const user = renderPicker()

    await waitFor(() => {
      expect(pick('Subscription')).toBeEnabled()
    })
    await choose(user, 'Subscription', /^Contoso Integration/)
    expect(sessionStore.getState().subscriptionId).toBe(TEST_SUB)
    expect(pick('Subscription')).toHaveTextContent('Contoso Integration')

    await waitFor(() => {
      expect(pick('APIM instance')).toBeEnabled()
    })
    await choose(user, 'APIM instance', /^apim-contoso/)
    expect(selectionStore.getState().service?.id).toBe(SERVICE_ID)

    await waitFor(() => {
      expect(pick('API')).toBeEnabled()
    })
    await choose(user, 'API', /^Orders API \(\/orders\)/)
    expect(selectionStore.getState().api?.name).toBe('orders-api')

    await waitFor(
      () => {
        expect(
          screen.getByText(/Orders API: 2 operations, 6 grants, 3 findings · done/),
        ).toBeInTheDocument()
      },
      { timeout: 3000 },
    )
  })

  it('forgets the APIM instance and API when the subscription changes', () => {
    selectionStore.getState().selectService({
      id: SERVICE_ID,
      subscriptionId: TEST_SUB,
      resourceGroup: 'rg',
      name: 'apim',
    })
    sessionStore.getState().setSubscriptionId(TEST_SUB)
    expect(selectionStore.getState().service).toBeUndefined()
  })

  it('shows a failed list in place, and retries it when a new token is pasted', async () => {
    server.use(
      http.get(
        `${ARM}/subscriptions`,
        () => HttpResponse.json({ error: { code: 'ExpiredAuthenticationToken' } }, { status: 401 }),
        { once: true },
      ),
    )
    sessionStore.getState().setToken('arm', armToken())
    renderPicker()
    await waitFor(() => {
      expect(screen.getByText(/Token expired or wrong audience/)).toBeInTheDocument()
    })

    sessionStore.getState().setToken('arm', armToken({ iat: 1 }))
    await waitFor(() => {
      expect(pick('Subscription')).toBeEnabled()
    })
    expect(screen.queryByText(/Token expired or wrong audience/)).not.toBeInTheDocument()
  })
})
