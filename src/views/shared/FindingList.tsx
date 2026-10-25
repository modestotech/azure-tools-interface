import { SeverityBadge } from '@/components/SeverityBadge'
import { FINDING_INFO, type Finding } from '@/domain'

/** Findings with their severity and title, for the details panels. */
export function FindingList({ findings }: { findings: readonly Finding[] }) {
  if (findings.length === 0) return null
  return (
    <ul className="space-y-1">
      {findings.map((finding, index) => {
        const info = FINDING_INFO[finding.kind]
        return (
          <li key={index} className="flex items-start gap-2">
            <SeverityBadge severity={info.severity}>{info.severity}</SeverityBadge>
            <span>{info.title}</span>
          </li>
        )
      })}
    </ul>
  )
}
