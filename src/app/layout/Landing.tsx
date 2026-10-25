import { Suspense, useMemo } from 'react'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { AccessModel } from '@/domain'
import { scripts } from '@/scripts/registry'
import { defaultParams } from '@/scripts/types'
import { OverviewCharts } from '@/views/overview'
import { views } from '@/views/registry'
import { AnalysisStatus } from '../scope/AnalysisStatus'
import { uiStore } from './uiStore'

/** The landing page: what the analysis found so far, and the views and scripts to open. */
export function Landing({ model }: { model: AccessModel | undefined }) {
  // Each script is pure, but on a large tenant one run can take a while: once per model.
  const found = useMemo(
    () =>
      model &&
      new Map(
        scripts.map((script) => [script.id, script.run(model, defaultParams(script)).rows.length]),
      ),
    [model],
  )
  return (
    <div className="space-y-4">
      <AnalysisStatus />
      {model && (
        <Suspense fallback={null}>
          <OverviewCharts model={model} />
        </Suspense>
      )}
      {views.length === 0 ? (
        <p className="text-muted-foreground text-sm">No views are registered yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {views.map((view) => (
            <button
              key={view.id}
              type="button"
              className="text-left"
              onClick={() => {
                uiStore.getState().openView(view.id)
              }}
            >
              <Card className="hover:bg-accent h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <view.icon className="size-4" /> {view.title}
                  </CardTitle>
                  <CardDescription>{view.description}</CardDescription>
                </CardHeader>
              </Card>
            </button>
          ))}
        </div>
      )}
      {scripts.length > 0 && (
        <section aria-label="Scripts" className="space-y-2">
          <h2 className="text-sm font-medium">Scripts</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {scripts.map((script) => (
              <li key={script.id}>
                <button
                  type="button"
                  className="hover:bg-accent flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm"
                  onClick={() => {
                    uiStore.getState().openScript(script.id)
                  }}
                >
                  <span className="flex-1">
                    <span className="block font-medium">{script.title}</span>
                    <span className="text-muted-foreground block text-xs">
                      {script.description}
                    </span>
                  </span>
                  {found && (
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {found.get(script.id)} found
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
