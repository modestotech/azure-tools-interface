import { API_RESOURCES, type ApiKind, type TokenIssue } from '@/lib/token'

/** Text for the token screen. Pure, so the wording is tested without rendering. */

/** `59 min 12 s`, `45 s`, or `expired 3 min ago`. */
export function formatRemaining(ms: number): string {
  const seconds = Math.floor(Math.abs(ms) / 1000)
  const minutes = Math.floor(seconds / 60)
  const text =
    minutes > 0 ? `${String(minutes)} min ${String(seconds % 60)} s` : `${String(seconds)} s`
  return ms > 0 ? text : `expired ${minutes > 0 ? `${String(minutes)} min` : text} ago`
}

export function issueMessage(api: ApiKind, issue: TokenIssue): string {
  const { label } = API_RESOURCES[api]
  switch (issue.kind) {
    case 'wrong-audience':
      return `This is not the ${label} token: its audience is ${issue.actual}, expected ${issue.expected}. Requests are blocked until you paste the right one.`
    case 'tenant-mismatch':
      return `The token is for tenant ${issue.actual}, not the entered ${issue.expected}.`
    case 'expiring-soon':
      return `Expires in ${formatRemaining(issue.msLeft)}. Get a fresh one soon.`
    case 'expired':
      return 'Expired. Requests are blocked until you paste a fresh one.'
  }
}
