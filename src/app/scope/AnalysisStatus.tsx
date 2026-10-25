import { useAccessModel } from '@/domain'
import { useSelection } from '../session/selectionStore'
import { useSession } from '../session/sessionStore'

/** A one-line summary of the running analysis, above the landing page's chart. */
export function AnalysisStatus() {
  const service = useSelection((state) => state.service)
  const api = useSelection((state) => state.api)
  const entra = useSession((state) => state.entra)
  const model = useAccessModel(service, api, entra)
  if (!model) return null
  const grants = model.edges.filter((edge) => edge.kind === 'grant').length
  return (
    <p className="text-muted-foreground text-sm" aria-live="polite">
      {model.api.displayName}: {model.operations.length} operations,{' '}
      {model.entra ? `${String(grants)} grants` : 'ARM only (callers need Entra)'},{' '}
      {model.findings.length} findings
      {model.problems.length > 0 && `, ${String(model.problems.length)} could not be loaded`}
      {model.pending.length > 0 ? ` · loading ${String(model.pending.length)}…` : ' · done'}
    </p>
  )
}
