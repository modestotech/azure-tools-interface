import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CopyButton } from './CopyButton'

describe('CopyButton', () => {
  it('confirms a copy', async () => {
    const user = userEvent.setup()
    render(<CopyButton text="az account get-access-token" />)
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(screen.getByText('Copied')).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe('az account get-access-token')
  })

  it('says so when the browser refuses', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'))
    render(<CopyButton text="az account get-access-token" />)
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/blocked the clipboard/)
    expect(screen.getByText('Not copied')).toBeInTheDocument()
  })
})
