import { Suspense } from 'react'
import { useAccessModel } from '@/domain'
import { views } from '@/views/registry'
import { useSelection } from '../session/selectionStore'
import { useSession } from '../session/sessionStore'
import { Landing } from './Landing'
import { Scripts } from './Scripts'
import { SCRIPTS_PAGE_ID, useUi } from './uiStore'

/**
 * The analysis of the selected API: the open view or the scripts, given the model once, or the
 * landing page.
 * Loaded lazily by the shell once an API is chosen, so the policy parser, the XML libraries and
 * the mapper stay out of the first page load.
 */
export default function Analysis() {
  const service = useSelection((state) => state.service)
  const api = useSelection((state) => state.api)
  const entra = useSession((state) => state.entra)
  const model = useAccessModel(service, api, entra)
  const activeId = useUi((state) => state.activeViewId)
  const view = views.find((item) => item.id === activeId)
  if (model && activeId === SCRIPTS_PAGE_ID) return <Scripts model={model} />
  if (!view || !model) return <Landing model={model} />
  return (
    <Suspense fallback={<p className="text-muted-foreground text-sm">Loading view…</p>}>
      <view.component model={model} />
    </Suspense>
  )
}
