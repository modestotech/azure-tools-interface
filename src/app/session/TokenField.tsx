import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useMemo } from 'react'
import { CopyButton } from '@/components/CopyButton'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  API_RESOURCES,
  azTokenCommand,
  checkToken,
  decodeJwt,
  isBlockingIssue,
  type ApiKind,
} from '@/lib/token'
import { useNow } from '../useNow'
import { sessionStore, useSession } from './sessionStore'
import { formatRemaining, issueMessage } from './tokenText'

/** One API's token: the az command, the paste field, and what the token says about itself. */
export function TokenField({ api }: { api: ApiKind }) {
  const token = useSession((state) => state.tokens[api])
  const tenantId = useSession((state) => state.tenantId)
  const { label, resource } = API_RESOURCES[api]
  const command = azTokenCommand(api, tenantId)
  const id = `token-${api}`

  return (
    <section className="space-y-2">
      <Label htmlFor={id} className="text-base">
        {label} token <span className="text-muted-foreground font-normal">({resource})</span>
      </Label>
      <div className="flex items-start gap-2">
        <code className="bg-muted flex-1 rounded px-2 py-1.5 text-xs wrap-anywhere whitespace-pre-wrap">
          {command}
        </code>
        <CopyButton text={command} label="Copy command" />
      </div>
      <textarea
        id={id}
        className="border-input focus-visible:ring-ring/50 dark:bg-input/30 min-h-16 w-full rounded-md border bg-transparent px-3 py-2 font-mono text-xs break-all outline-none focus-visible:ring-[3px]"
        placeholder={`Paste the ${label} access token`}
        value={token}
        onChange={(event) => {
          sessionStore.getState().setToken(api, event.target.value)
        }}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {token && <ClaimSummary api={api} token={token} tenantId={tenantId} />}
    </section>
  )
}

function ClaimSummary({ api, token, tenantId }: { api: ApiKind; token: string; tenantId: string }) {
  const now = useNow()
  const decoded = useMemo(() => decodeJwt(token), [token])
  if (!decoded.ok) {
    return (
      <p role="alert" className="text-destructive flex items-center gap-1 text-sm">
        <AlertTriangle className="size-4" /> {decoded.error}
      </p>
    )
  }
  const { claims } = decoded
  const issues = checkToken({ api, claims, tenantId, now })
  const blocked = issues.some(isBlockingIssue)
  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {blocked ? (
          <Badge variant="destructive">Blocked</Badge>
        ) : (
          <Badge variant="secondary">
            <CheckCircle2 /> Usable
          </Badge>
        )}
        <span>Expires in {formatRemaining(claims.expiresAt - now)}</span>
      </div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Audience</dt>
        <dd className="break-all">{claims.displayAudience}</dd>
        <dt className="text-muted-foreground">Tenant</dt>
        <dd className="break-all">{claims.tid ?? '—'}</dd>
        <dt className="text-muted-foreground">Signed in as</dt>
        <dd className="break-all">{claims.signInName ?? claims.oid ?? '—'}</dd>
      </dl>
      {issues.length > 0 && (
        <ul className="space-y-1">
          {issues.map((issue) => (
            <li
              key={issue.kind}
              className={
                isBlockingIssue(issue) ? 'text-destructive' : 'text-amber-700 dark:text-amber-400'
              }
            >
              {issueMessage(api, issue)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
