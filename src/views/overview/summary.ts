import type { AccessModel, FindingKind, Severity } from '@/domain'
import { FINDING_INFO } from '@/domain'
import { authSummary } from '../shared/summaries'

/** The landing page's numbers: how operations are protected, and the findings by kind. Pure. */

export type AuthCoverage = 'roles' | 'token-only' | 'none' | 'unreadable' | 'loading'

export const AUTH_COVERAGE_LABEL: Readonly<Record<AuthCoverage, string>> = {
  roles: 'Role required',
  'token-only': 'Token, no role',
  none: 'No auth',
  unreadable: 'Policy unreadable',
  loading: 'Loading',
}

const AUTH_COVERAGE_ORDER: readonly AuthCoverage[] = [
  'roles',
  'token-only',
  'none',
  'unreadable',
  'loading',
]

export interface CoverageCount {
  readonly coverage: AuthCoverage
  readonly operations: number
}

/** Operations per kind of protection, in a fixed order; kinds with no operation are left out. */
export function authCoverage(model: AccessModel): CoverageCount[] {
  const counts = new Map<AuthCoverage, number>()
  for (const access of model.operations) {
    const auth = authSummary(access)
    const coverage: AuthCoverage =
      auth.kind === 'jwt' ? (auth.roles.length > 0 ? 'roles' : 'token-only') : auth.kind
    counts.set(coverage, (counts.get(coverage) ?? 0) + 1)
  }
  return AUTH_COVERAGE_ORDER.flatMap((coverage) => {
    const operations = counts.get(coverage) ?? 0
    return operations > 0 ? [{ coverage, operations }] : []
  })
}

export interface FindingCount {
  readonly kind: FindingKind
  readonly title: string
  readonly severity: Severity
  readonly count: number
}

const SEVERITY_RANK: Readonly<Record<Severity, number>> = { high: 0, medium: 1, info: 2 }

/** Findings per kind, most severe first, then most frequent. */
export function findingsByKind(model: AccessModel): FindingCount[] {
  const counts = new Map<FindingKind, number>()
  for (const finding of model.findings)
    counts.set(finding.kind, (counts.get(finding.kind) ?? 0) + 1)
  return [...counts]
    .map(([kind, count]) => ({ kind, count, ...FINDING_INFO[kind] }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        b.count - a.count ||
        a.kind.localeCompare(b.kind),
    )
}
