import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { decodeJwt } from '@/lib/token'
import { onClearSession } from './clearSession'
import { sessionStore, useSession } from './sessionStore'

/**
 * The tenant ID. The typed draft stays here; the store only ever holds a valid GUID or domain
 * name, so an invalid value never reaches a URL or an az command.
 */
export function TenantField() {
  const tenantId = useSession((state) => state.tenantId)
  const armToken = useSession((state) => state.tokens.arm)
  const [draft, setDraft] = useState<string | undefined>(undefined)
  const [invalid, setInvalid] = useState(false)

  // Until the user types, show the stored value, or offer the ARM token's tenant.
  const decoded = armToken ? decodeJwt(armToken) : undefined
  const suggested = decoded?.ok ? decoded.claims.tid : undefined
  const value = draft ?? (tenantId || suggested || '')

  // Until the user types, store the ARM token's tenant, so the az commands and masking use it.
  useEffect(() => {
    if (draft === undefined && !tenantId && suggested)
      sessionStore.getState().setTenantId(suggested)
  }, [draft, tenantId, suggested])

  // "Clear session" also forgets what was typed here.
  useEffect(
    () =>
      onClearSession(() => {
        setDraft(undefined)
        setInvalid(false)
      }),
    [],
  )

  const commit = (text: string) => {
    setDraft(text)
    const empty = text.trim() === ''
    const valid = sessionStore.getState().setTenantId(text) || empty
    setInvalid(!valid)
  }

  return (
    <div className="space-y-1">
      <Label htmlFor="tenant-id">Tenant ID</Label>
      <Input
        id="tenant-id"
        value={value}
        placeholder="GUID or domain, e.g. contoso.onmicrosoft.com"
        aria-invalid={invalid}
        aria-describedby={invalid ? 'tenant-error' : undefined}
        onChange={(event) => {
          commit(event.target.value)
        }}
        autoComplete="off"
        spellCheck={false}
      />
      {invalid ? (
        <p id="tenant-error" className="text-destructive text-sm">
          Enter a tenant GUID or a domain name such as contoso.onmicrosoft.com.
        </p>
      ) : (
        <p className="text-muted-foreground text-xs">
          Filled in from the ARM token. Used in the az commands and to check both tokens.
        </p>
      )}
    </div>
  )
}
