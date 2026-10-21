import { render, screen } from '@testing-library/react'
import { App } from './App'
import { AppProviders } from './AppProviders'

describe('App', () => {
  it('renders the title', () => {
    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )
    expect(screen.getByRole('heading', { name: 'APIM Access Mapper' })).toBeInTheDocument()
  })
})
