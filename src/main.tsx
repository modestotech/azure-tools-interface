import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { AppProviders } from '@/app/AppProviders'
import './index.css'

async function enableDemoMocks(): Promise<void> {
  // Demo builds (`pnpm dev:demo`, the GitHub Pages demo) serve fictional ARM/Graph data from MSW.
  // Never included in production builds.
  if (import.meta.env.MODE !== 'demo') return
  const { worker, onUnhandledRequest } = await import('@/test/msw/browser')
  // Under the demo's base path, not the site root. A service worker only controls pages under its
  // own folder, so the demo's worker can't intercept the real app hosted beside it.
  await worker.start({
    onUnhandledRequest,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  })
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
