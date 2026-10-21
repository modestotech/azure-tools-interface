import { useAccessModel } from '@/domain'
import { useSelection } from '../session/selectionStore'

/** A one-line summary of the running analysis, until the views (M6) show the model itself. */
export function AnalysisStatus() {
  const service = useSelection((state) => state.service)
  const api = useSelection((state) => state.api)
  const model = useAccessModel(service, api)
  if (!model) return null
  const grants = model.edges.filter((edge) => edge.kind === 'grant').length
  return (
    <p className="text-muted-foreground text-sm" aria-live="polite">
      {model.api.displayName}: {model.operations.length} operations, {grants} grants,{' '}
      {model.findings.length} findings
      {model.problems.length > 0 && `, ${String(model.problems.length)} could not be loaded`}
      {model.pending.length > 0 ? ` · loading ${String(model.pending.length)}…` : ' · done'}
    </p>
  )
}
