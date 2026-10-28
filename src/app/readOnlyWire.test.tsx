import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GRAPH_BATCH_URL } from '@/lib/http/readOnly'
import { API_RESOURCES } from '@/lib/token'
import { armToken, graphToken } from '@/test/helpers/fakeJwt'
import { server } from '@/test/msw/server'
import { AppProviders } from './AppProviders'
import { AnalysisStatus } from './scope/AnalysisStatus'
import { ScopePicker } from './scope/ScopePicker'
import { sessionStore } from './session/sessionStore'

/**
 * The read-only guarantee, checked on the wire: every request a complete run sends (pickers,
 * then the whole analysis of one API) is a GET without a body, or a Graph `$batch` POST whose
 * sub-requests are all GETs. `lib/http/readOnly.test.ts` checks the guard itself; this checks
 * what actually goes out.
 */

interface SeenRequest {
  readonly method: string
  readonly url: string
  readonly body: string
}

/** Every request MSW receives until the test ends; `settled()` waits for their bodies. */
function recordRequests(): { seen: SeenRequest[]; settled: () => Promise<unknown> } {
  const seen: SeenRequest[] = []
  const pending: Promise<void>[] = []
  const listener = ({ request }: { request: Request }) => {
    pending.push(
      request
        .clone()
        .text()
        .then((body) => {
          seen.push({ method: request.method, url: request.url, body })
        }),
    )
  }
  server.events.on('request:start', listener)
  onTestFinished(() => {
    server.events.removeListener('request:start', listener)
  })
  return { seen, settled: () => Promise.all(pending) }
}

const pick = (label: string) => screen.getByRole('combobox', { name: label })

async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: RegExp) {
  await waitFor(() => {
    expect(pick(label)).toBeEnabled()
  })
  await user.click(pick(label))
  await user.click(await screen.findByRole('option', { name: option }))
}

// A whole run chains several waits (three pickers, then the analysis), each up to the default.
describe('requests on the wire', { timeout: 15_000 }, () => {
  it('are only GETs, and $batch POSTs of GETs, through a whole analysis', async () => {
    const { seen, settled } = recordRequests()
    sessionStore.getState().setToken('arm', armToken())
    sessionStore.getState().setToken('graph', graphToken())
    const user = userEvent.setup()
    render(
      <AppProviders>
        <ScopePicker />
        <AnalysisStatus />
      </AppProviders>,
    )
    await choose(user, 'Subscription', /^Contoso Integration/)
    await choose(user, 'APIM instance', /^apim-contoso/)
    await choose(user, 'API', /^Orders API/)
    await waitFor(() => {
      expect(screen.getByText(/· done/)).toBeInTheDocument()
    })
    await settled()

    expect(seen.length).toBeGreaterThan(10)
    const batches = seen.filter((request) => request.method !== 'GET')
    // The $batch path is exercised, so the check below isn't vacuous.
    expect(batches.length).toBeGreaterThan(0)
    for (const request of seen) {
      if (request.method === 'GET') {
        expect(request.body, request.url).toBe('')
        continue
      }
      expect(request.method, request.url).toBe('POST')
      expect(request.url).toBe(GRAPH_BATCH_URL)
      const body = JSON.parse(request.body) as { requests: { method: string }[] }
      expect(body.requests.length).toBeGreaterThan(0)
      expect(body.requests.every((sub) => sub.method === 'GET')).toBe(true)
    }
  })

  it('are only GETs to ARM in ARM-only mode: no Graph request, no POST', async () => {
    const { seen, settled } = recordRequests()
    sessionStore.getState().setEntra(false)
    sessionStore.getState().setToken('arm', armToken())
    const user = userEvent.setup()
    render(
      <AppProviders>
        <ScopePicker />
        <AnalysisStatus />
      </AppProviders>,
    )
    await choose(user, 'Subscription', /^Contoso Integration/)
    await choose(user, 'APIM instance', /^apim-contoso/)
    await choose(user, 'API', /^Orders API/)
    await waitFor(() => {
      expect(screen.getByText(/ARM only \(callers need Entra\).*· done/)).toBeInTheDocument()
    })
    await settled()

    expect(seen.length).toBeGreaterThan(5)
    for (const request of seen) {
      expect(`${request.method} ${new URL(request.url).origin}`, request.url).toBe(
        `GET ${API_RESOURCES.arm.origin}`,
      )
      expect(request.body, request.url).toBe('')
    }
  })
})
