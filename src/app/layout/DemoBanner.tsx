import { FlaskConical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { sessionStore } from '../session/sessionStore'

/** Fills in fictional tokens that the demo's mocked ARM and Graph accept. Demo builds only. */
async function fillDemoTokens(): Promise<void> {
  const { armToken, graphToken, TEST_TENANT } = await import('@/test/helpers/fakeJwt')
  const session = sessionStore.getState()
  session.setTenantId(TEST_TENANT)
  session.setToken('arm', armToken())
  session.setToken('graph', graphToken())
}

/** Shown in `pnpm dev:demo` only, where MSW serves fictional data. */
export function DemoBanner() {
  if (import.meta.env.MODE !== 'demo') return null
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <FlaskConical className="size-4" />
      <span>
        <strong>Demo mode:</strong> fictional data. Don&apos;t paste real tokens here.
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          void fillDemoTokens()
        }}
      >
        Fill in demo tokens
      </Button>
    </div>
  )
}
