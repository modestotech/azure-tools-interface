import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { AppProviders } from '@/app/AppProviders'
import './index.css'

async function enableDemoMocks(): Promise<void> {
  // `pnpm dev:demo` serves fictional ARM/Graph data from MSW. Never included in production builds.
  if (import.meta.env.MODE !== 'demo') return
  const { worker, onUnhandledRequest } = await import('@/test/msw/browser')
  await worker.start({ onUnhandledRequest })
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

void enableDemoMocks().then(() => {
  createRoot(root).render(
    <StrictMode>
      <AppProviders>
        <App />
      </AppProviders>
    </StrictMode>,
  )
})
