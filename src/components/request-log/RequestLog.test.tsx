import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RequestLogEntry } from '@/lib/http'
import { TEST_SUB } from '@/test/helpers/fakeJwt'
import { stubElementSize } from '@/test/helpers/layout'
import { logEntry } from '@/test/helpers/logEntry'
import { ALL_LINES, type LogFilter } from './filter'
import { RequestLog, type RequestLogProps } from './RequestLog'

const COUNTERS = { inFlight: 1, finished: 2, errors: 1, retries: 0 }

const ENTRIES: RequestLogEntry[] = [
  logEntry({ id: 1, rawUrl: logEntry().rawUrl.replace('{sub}', TEST_SUB) }),
  logEntry({
    id: 2,
    api: 'graph',
    state: 'error',
    status: 403,
    errorKind: 'forbidden',
    error: 'Azure said no to alice@contoso.example.net',
  }),
  logEntry({
    id: 3,
    state: 'pending',
    url: `${logEntry().url.split('/apis')[0] ?? ''}/apis/orders/operations/get/policies/policy`,
  }),
]

function renderLog(props: Partial<RequestLogProps> = {}) {
  stubElementSize()
  const handlers = {
    onOpenChange: vi.fn<(open: boolean) => void>(),
    onRevealedChange: vi.fn<(revealed: boolean) => void>(),
    onFilterChange: vi.fn<(filter: LogFilter) => void>(),
    onHide: vi.fn<() => void>(),
  }
  render(
    <RequestLog
      entries={ENTRIES}
      counters={COUNTERS}
      open
      revealed={false}
      filter={ALL_LINES}
      {...handlers}
      {...props}
    />,
  )
  return { user: userEvent.setup(), ...handlers }
}

const lines = () => within(screen.getByTestId('request-log-lines')).queryAllByRole('listitem')

describe('RequestLog', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the counters and one masked line per request', () => {
    renderLog()
    const log = screen.getByRole('region', { name: 'Request log' })
    expect(log).toHaveTextContent('1 in flight · 2 done · 1 errors · 0 retries')
    expect(lines().map((line) => line.textContent)).toEqual([
      'GET 200 143ms 4.2kB arm …/service/apim/apis',
      expect.stringMatching(/^GET 403 .* graph .* ✗ forbidden$/),
      expect.stringMatching(/^GET \.\.\. .*\/operations\/get\/policies\/policy$/),
    ])
    expect(log).not.toHaveTextContent(TEST_SUB)
    // Azure's text stays on screen, in the line's tooltip.
    expect(lines()[1]).toHaveAttribute('title', expect.stringContaining('Azure said no'))
  })

  it('marks pending lines to flicker and error lines red', () => {
    renderLog()
    expect(lines()[1]).toHaveClass('text-log-error')
    expect(lines()[2]).toHaveClass('animate-pulse', 'motion-reduce:animate-none')
  })

  it('shows the progress of the operation policy fetches', () => {
    renderLog()
    const bar = screen.getByRole('progressbar', { name: 'Operation policies fetched' })
    expect(bar).toHaveAttribute('aria-valuenow', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '1')
  })

  it('shows only the lines the filter lets through, and asks to change it', async () => {
    const { user, onFilterChange } = renderLog({ filter: { source: 'graph', status: 'all' } })
    expect(lines()).toHaveLength(1)
    await user.click(
      within(screen.getByRole('group', { name: 'Status' })).getByRole('button', {
        name: 'problems',
      }),
    )
    expect(onFilterChange).toHaveBeenCalledWith({ source: 'graph', status: 'problems' })
  })

  it('shows the raw URLs only when revealed', async () => {
    const { user, onRevealedChange } = renderLog({ revealed: true })
    expect(lines()[0]).toHaveAttribute('title', expect.stringContaining(TEST_SUB))
    await user.click(screen.getByRole('button', { name: 'Reveal subscription and tenant IDs' }))
    expect(onRevealedChange).toHaveBeenCalledWith(false)
  })

  it('exports the allowlisted, masked fields only, even while revealed', async () => {
    const blobs: Blob[] = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      blobs.push(blob as Blob)
      return 'blob:log'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const { user } = renderLog({ revealed: true })

    await user.click(screen.getByRole('button', { name: 'Export the log as JSON (masked)' }))

    expect(click).toHaveBeenCalledOnce()
    const text = await blobs[0]?.text()
    expect(text).toContain('{sub}')
    expect(text).not.toContain(TEST_SUB)
    expect(text).not.toContain('Azure said no')
    expect(text).toContain('"errorKind": "forbidden"')
  })

  it('asks to be hidden', async () => {
    const { user, onHide } = renderLog({ open: false })
    await user.click(screen.getByRole('button', { name: 'Hide the request log' }))
    expect(onHide).toHaveBeenCalledOnce()
  })

  it('folds to the header', async () => {
    const { user, onOpenChange } = renderLog({ open: false })
    expect(screen.queryByTestId('request-log-lines')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /requests:/ }))
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })
})
