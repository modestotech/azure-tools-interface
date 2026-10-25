import { Suspense } from 'react'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { AccessModel } from '@/domain'
import { OverviewCharts } from '@/views/overview'
import { views } from '@/views/registry'
import { AnalysisStatus } from '../scope/AnalysisStatus'
import { uiStore } from './uiStore'

/** The landing page: what the analysis found so far, and the views to open. */
export function Landing({ model }: { model: AccessModel | undefined }) {
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
    </div>
  )
}
