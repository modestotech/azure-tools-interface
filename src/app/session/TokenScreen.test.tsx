import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { API_RESOURCES } from '@/lib/token'
import { armToken, graphToken, TEST_TENANT } from '@/test/helpers/fakeJwt'
import { sessionStore } from './sessionStore'
import { TokenScreen } from './TokenScreen'
import { formatRemaining } from './tokenText'

function setup() {
  const user = userEvent.setup()
  render(<TokenScreen />)
  const field = (label: string) => screen.getByLabelText(new RegExp(`^${label} token`))
  return { user, field }
}

describe('TokenScreen', () => {
  it('shows the safety notice folded to its title, and opens it on click', async () => {
    const { user } = setup()
    const title = screen.getByText('How your tokens are handled')
    const details = title.closest('details')
    expect(details).not.toHaveAttribute('open')
    await user.click(title)
    expect(details).toHaveAttribute('open')
    expect(screen.getByText(/Not saved\./)).toBeVisible()
  })

  it('decodes a pasted ARM token and fills in the tenant from it', async () => {
    const { user, field } = setup()
    await user.click(field('ARM'))
    await user.paste(armToken())

    expect(screen.getByText('Usable')).toBeInTheDocument()
    expect(screen.getByText(API_RESOURCES.arm.resource, { selector: 'dd' })).toBeInTheDocument()
    expect(screen.getByLabelText('Tenant ID')).toHaveValue(TEST_TENANT)
    expect(sessionStore.getState().tenantId).toBe(TEST_TENANT)
    expect(screen.getAllByText(new RegExp(`--tenant ${TEST_TENANT}`))).toHaveLength(2)
  })

  it('blocks a Graph token pasted into the ARM field, and says why', async () => {
    const { user, field } = setup()
    await user.click(field('ARM'))
    await user.paste(graphToken())
    expect(screen.getByText('Blocked')).toBeInTheDocument()
    expect(screen.getByText(/This is not the ARM token/)).toBeInTheDocument()
  })

  it('flags an expired token', async () => {
    const { user, field } = setup()
    await user.click(field('Graph'))
    await user.paste(graphToken({ exp: Math.floor(Date.now() / 1000) - 120 }))
    expect(screen.getByText(/Requests are blocked until you paste a fresh one/)).toBeInTheDocument()
  })

  it('reports text that is not a JWT', async () => {
    const { user, field } = setup()
    await user.click(field('Graph'))
    await user.paste('hello')
    expect(screen.getByText(/^Not a JWT/)).toBeInTheDocument()
  })

  it('rejects an invalid tenant without storing it', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText('Tenant ID'), 'x; rm -rf')
    expect(screen.getByText(/Enter a tenant GUID or a domain name/)).toBeInTheDocument()
    expect(sessionStore.getState().tenantId).toBe('')
    expect(screen.getAllByText(/--tenant <TENANT_ID>/)).toHaveLength(2)
  })

  it('copies the az command', async () => {
    const { user } = setup()
    const arm = screen.getByText(/--resource https:\/\/management\.azure\.com/).closest('div')
    if (!arm) throw new Error('no command row')
    await user.click(within(arm).getByRole('button', { name: 'Copy command' }))
    await expect(navigator.clipboard.readText()).resolves.toContain(
      `--resource ${API_RESOURCES.arm.resource}`,
    )
  })

  it('wipes tokens, the tenant and the typed draft on Clear session', async () => {
    const { user, field } = setup()
    await user.click(field('ARM'))
    await user.paste(armToken())
    await user.clear(screen.getByLabelText('Tenant ID'))
    await user.type(screen.getByLabelText('Tenant ID'), 'contoso.example.net')

    await user.click(screen.getByRole('button', { name: /Clear session/ }))

    expect(sessionStore.getState()).toMatchObject({ tokens: { arm: '', graph: '' }, tenantId: '' })
    expect(field('ARM')).toHaveValue('')
    expect(screen.getByLabelText('Tenant ID')).toHaveValue('')
  })
})

describe('formatRemaining', () => {
  it('formats time left and time since expiry', () => {
    expect(formatRemaining(3_552_000)).toBe('59 min 12 s')
    expect(formatRemaining(45_000)).toBe('45 s')
    expect(formatRemaining(-180_000)).toBe('expired 3 min ago')
  })
})

describe('TokenScreen in ARM-only mode', () => {
  it('asks for the ARM token only', async () => {
    const { user, field } = setup()
    expect(field('Graph')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /ARM only/ }))
    expect(sessionStore.getState().entra).toBe(false)
    expect(screen.queryByLabelText(/^Graph token/)).not.toBeInTheDocument()
    expect(field('ARM')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /ARM and Entra/ }))
    expect(field('Graph')).toBeInTheDocument()
  })
})

describe('TokenScreen demo link', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('links to no demo unless the build names one', () => {
    setup()
    expect(screen.queryByRole('link', { name: /demo/ })).not.toBeInTheDocument()
  })

  it('links to the demo hosted beside the app', () => {
    vi.stubEnv('VITE_DEMO_URL', '/azure-tools-interface/demo/')
    setup()
    expect(screen.getByRole('link', { name: /Try the demo/ })).toHaveAttribute(
      'href',
      '/azure-tools-interface/demo/',
    )
  })

  it('does not link to itself in the demo', () => {
    vi.stubEnv('VITE_DEMO_URL', '/azure-tools-interface/demo/')
    vi.stubEnv('MODE', 'demo')
    setup()
    expect(screen.queryByRole('link', { name: /demo/ })).not.toBeInTheDocument()
  })
})
