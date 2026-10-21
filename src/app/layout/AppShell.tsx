import { Suspense } from 'react'
import { useAccessModel } from '@/domain'
import { cn } from '@/lib/utils'
import { views } from '@/views/registry'
import { ScopePicker } from '../scope/ScopePicker'
import { useSelection } from '../session/selectionStore'
import { TokenScreen } from '../session/TokenScreen'
import { DemoBanner } from './DemoBanner'
import { Landing } from './Landing'
import { LogDock } from './LogDock'
import { uiStore, useUi } from './uiStore'

/** Navigation generated from the view registry, with the landing page first. */
function Nav() {
  const active = useUi((state) => state.activeViewId)
  const items = [{ id: undefined, title: 'Overview' }, ...views]
  return (
    <nav aria-label="Views" className="flex flex-wrap gap-1 border-b">
      {items.map((item) => (
        <button
          key={item.id ?? 'overview'}
          type="button"
          aria-current={item.id === active ? 'page' : undefined}
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-sm',
            item.id === active
              ? 'border-primary font-medium'
              : 'text-muted-foreground border-transparent',
          )}
          onClick={() => {
            uiStore.getState().openView(item.id)
          }}
        >
          {item.title}
        </button>
      ))}
    </nav>
  )
}

/** The open view, given the model once; falls back to the landing page. */
function Content() {
  const service = useSelection((state) => state.service)
  const api = useSelection((state) => state.api)
  const model = useAccessModel(service, api)
  const activeId = useUi((state) => state.activeViewId)
  const view = views.find((item) => item.id === activeId)
  if (!view || !model) return <Landing />
  return (
    <Suspense fallback={<p className="text-muted-foreground text-sm">Loading view…</p>}>
      <view.component model={model} />
    </Suspense>
  )
}

/** Session and scope on top, then the views, with the request log docked at the bottom. */
export function AppShell() {
  const api = useSelection((state) => state.api)
  return (
    <div className="flex min-h-svh flex-col">
      <DemoBanner />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6">
        <header>
          <h1 className="text-2xl font-semibold">APIM Access Mapper</h1>
          <p className="text-muted-foreground text-sm">
            Maps Azure API Management policies to the Microsoft Entra identities allowed to call
            each operation.
          </p>
        </header>
        {/* Open until an API is chosen; then folded away so the analysis has the room. */}
        <details open={api === undefined} className="group space-y-4">
          <summary className="cursor-pointer text-sm font-medium">Session and scope</summary>
          <div className="mt-4 space-y-4">
            <TokenScreen />
            <ScopePicker />
          </div>
        </details>
        <Nav />
        <Content />
      </main>
      <div className="sticky bottom-0">
        <LogDock />
      </div>
    </div>
  )
}
