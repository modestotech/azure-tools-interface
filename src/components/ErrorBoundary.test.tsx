import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ErrorBoundary } from './ErrorBoundary'

let broken = true

function Fragile() {
  if (broken) throw new Error('view crashed')
  return <p>view works</p>
}

function Harness() {
  const [key, setKey] = useState(1)
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setKey(key + 1)
        }}
      >
        change key
      </button>
      <ErrorBoundary
        resetKeys={[key]}
        fallback={({ error, reset }) => (
          <div role="alert">
            {error.message}
            <button type="button" onClick={reset}>
              retry
            </button>
          </div>
        )}
      >
        <Fragile />
      </ErrorBoundary>
    </>
  )
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    broken = true
    // React reports caught render errors to the console; keep the test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the fallback instead of the children, and keeps the rest of the page', () => {
    render(<Harness />)
    expect(screen.getByRole('alert')).toHaveTextContent('view crashed')
    expect(screen.getByRole('button', { name: 'change key' })).toBeInTheDocument()
  })

  it('renders the children again on reset', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    broken = false
    await user.click(screen.getByRole('button', { name: 'retry' }))
    expect(screen.getByText('view works')).toBeInTheDocument()
  })

  it('clears the error when a reset key changes', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    broken = false
    await user.click(screen.getByRole('button', { name: 'change key' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
