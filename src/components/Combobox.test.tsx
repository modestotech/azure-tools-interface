import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Combobox } from './Combobox'

const OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const number = String(i + 1).padStart(4, '0')
  return { value: `apim${number}-api`, label: `APIM${number} - API ${String(i + 1)}` }
})

function renderCombobox() {
  const user = userEvent.setup()
  render(
    <>
      <span id="label">API</span>
      <Combobox
        id="api"
        labelledBy="label"
        options={OPTIONS}
        value={undefined}
        onChange={vi.fn()}
      />
    </>,
  )
  return user
}

const optionNames = () => screen.getAllByRole('option').map((option) => option.textContent)

describe('Combobox search', () => {
  it('finds options containing what was typed: 02 finds 0002', async () => {
    const user = renderCombobox()
    await user.click(screen.getByRole('combobox', { name: 'API' }))
    await user.type(screen.getByPlaceholderText(/Search/), '02')
    expect(optionNames()).toEqual(['APIM0002 - API 2'])
  })

  it('treats * as a wildcard', async () => {
    const user = renderCombobox()
    await user.click(screen.getByRole('combobox', { name: 'API' }))
    await user.type(screen.getByPlaceholderText(/Search/), 'apim*1 -')
    expect(optionNames()).toEqual(['APIM0001 - API 1', 'APIM0011 - API 11'])
  })
})
