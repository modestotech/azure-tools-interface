import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TEST_SUB } from '@/test/helpers/fakeJwt'
import { sessionStore } from '../session/sessionStore'
import { AnalysisError } from './AnalysisError'

describe('AnalysisError', () => {
  it('shows the error with the subscription ID masked, and offers a retry', async () => {
    sessionStore.getState().setSubscriptionId(TEST_SUB)
    const reset = vi.fn()
    render(
      <AnalysisError
        error={new TypeError(`failed for /subscriptions/${TEST_SUB}/x`)}
        reset={reset}
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('TypeError: failed for /subscriptions/{sub}/x')
    expect(alert).not.toHaveTextContent(TEST_SUB)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledOnce()
  })
})
