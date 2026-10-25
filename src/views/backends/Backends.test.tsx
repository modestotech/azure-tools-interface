import { render, screen, within } from '@testing-library/react'
import { buildAccessModel } from '@/domain'
import { fixtureInputs } from '@/test/fixtures/accessModel'
import Backends from './Backends'

describe('Backends', () => {
  it('shows the backend, its TLS settings, credential mechanisms and APIM’s roles there', () => {
    render(<Backends model={buildAccessModel(fixtureInputs())} />)
    const card = within(screen.getByRole('region', { name: 'Backend Orders service' }))
    expect(card.getByText('https://ca-contoso-orders.example.net/api')).toBeInTheDocument()
    expect(card.getByText('header')).toBeInTheDocument()
    expect(card.getByText('id-apim-contoso')).toBeInTheDocument()
    expect(card.getByText('Backend.Invoke')).toBeInTheDocument()
    // Credential values (the function key's named value) are never shown.
    expect(card.queryByText(/orders-function-key/)).not.toBeInTheDocument()
  })
})

describe('Backends in ARM-only mode', () => {
  it('names APIM’s identity from ARM, and says its roles need Entra', () => {
    render(<Backends model={buildAccessModel({ ...fixtureInputs(), entra: false })} />)
    const card = within(screen.getByRole('region', { name: 'Backend Orders service' }))
    expect(card.getByText('id-apim-contoso')).toBeInTheDocument()
    expect(card.getByText('needs Entra')).toBeInTheDocument()
  })
})
