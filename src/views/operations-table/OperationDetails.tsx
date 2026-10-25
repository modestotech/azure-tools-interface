import { FINDING_INFO } from '@/domain'
import { authText, backendText, outboundText, type OperationRow } from './rows'
import { SeverityBadge } from './SeverityBadge'

/** The selected operation: everything in its row, plus each finding and the XML to review. */
export function OperationDetails({ row }: { row: OperationRow }) {
  const unresolved = row.findings.flatMap((finding) =>
    finding.kind === 'unresolved-rule' ? [finding.rule] : [],
  )
  return (
    <section
      aria-label={`Details of ${row.name}`}
      className="space-y-3 rounded-md border p-4 text-sm"
    >
      <h2 className="font-medium">
        <span className="font-mono">
          {row.method} {row.path}
        </span>{' '}
        · {row.name}
      </h2>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">Auth</dt>
        <dd>{authText(row.auth)}</dd>
        <dt className="text-muted-foreground">Callers</dt>
        <dd>{row.callers}</dd>
        <dt className="text-muted-foreground">Backend</dt>
        <dd className="break-all">
          {backendText(row)}
          {row.backend?.backendId && ` (backend ${row.backend.backendId})`}
        </dd>
        <dt className="text-muted-foreground">Outbound auth</dt>
        <dd className="break-all">{outboundText(row.outbound)}</dd>
      </dl>
      {row.findings.length > 0 && (
        <ul className="space-y-1">
          {row.findings.map((finding, index) => {
            const info = FINDING_INFO[finding.kind]
            return (
              <li key={index} className="flex items-start gap-2">
                <SeverityBadge severity={info.severity}>{info.severity}</SeverityBadge>
                <span>{info.title}</span>
              </li>
            )
          })}
        </ul>
      )}
      {unresolved.map((rule, index) => (
        <div key={index} className="space-y-1">
          <p>
            Needs manual review: <code>&lt;{rule.element}&gt;</code> in {rule.source.scope}{' '}
            {rule.source.section} — {rule.reason}
          </p>
          <pre className="bg-muted overflow-x-auto rounded p-2 text-xs">{rule.xml}</pre>
        </div>
      ))}
    </section>
  )
}
