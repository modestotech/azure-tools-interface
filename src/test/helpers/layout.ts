import { onTestFinished, vi } from 'vitest'

/**
 * jsdom lays nothing out, so every element measures 0×0 and a virtualized list renders no rows.
 * Gives every element a fixed size until the current test ends.
 */
export function stubElementSize(width = 800, height = 224): void {
  const spies = [
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(width),
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(height),
  ]
  onTestFinished(() => {
    for (const spy of spies) spy.mockRestore()
  })
}
