import type { ReactNode } from 'react'
import type { AccessModel } from '@/domain'
import { FindingList } from '../shared/FindingList'
import { NEEDS_ENTRA } from '../shared/summaries'
import type { ViewProps } from '../types'
import { backendRows, type BackendRow, type OutboundUse } from './rows'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all">{children}</dd>
    </>
  )
}

const yesNo = (value: boolean | undefined) =>
  value === undefined ? 'not set' : value ? 'yes' : 'no'

function operationNames(model: AccessModel, ids: readonly string[]): string {
  return ids
    .map((id) => {
      const operation = model.operations.find((item) => item.operation.id === id)?.operation
      return operation ? `${operation.method} ${operation.urlTemplate}` : id
    })
    .join(', ')
}

function Outbound({ model, use }: { model: AccessModel; use: OutboundUse }) {
  const { outbound } = use
  if (outbound.mechanism === 'None') {
    return (
      <p>
        No credentials sent{' '}
        <span className="text-muted-foreground">({operationNames(model, use.operationIds)})</span>
      </p>
    )
  }
  const roles = outbound.roles.map((role) => role.value ?? role.displayName ?? role.id)
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
      <Field label="Managed identity">{use.identity}</Field>
      {outbound.clientId && <Field label="Client ID">{outbound.clientId}</Field>}
      <Field label="Principal ID">{outbound.principalId ?? 'unknown'}</Field>
      <Field label="Token audience">{outbound.resource}</Field>
      <Field label="Roles held there">
        {!model.entra
          ? NEEDS_ENTRA
          : roles.length > 0
            ? roles.join(', ')
            : outbound.principalId
              ? 'none'
              : 'unknown'}
      </Field>
      <Field label="Used by">{operationNames(model, use.operationIds)}</Field>
    </dl>
  )
}

function BackendCard({ model, row }: { model: AccessModel; row: BackendRow }) {
  const { backend } = row
  const title = backend?.title ?? backend?.backendId ?? row.key
  return (
    <section aria-label={`Backend ${title}`} className="space-y-3 rounded-md border p-4 text-sm">
      <h2 className="font-medium">{title}</h2>
      {backend ? (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
          {backend.backendId && <Field label="Backend ID">{backend.backendId}</Field>}
          <Field label="URL">{backend.url ?? 'none'}</Field>
          <Field label="Type">{backend.type}</Field>
          {backend.protocol && <Field label="Protocol">{backend.protocol}</Field>}
          {backend.type !== 'ApiServiceUrl' && (
            <>
              <Field label="Validates certificate chain">
                {yesNo(backend.tls.validateCertificateChain)}
              </Field>
              <Field label="Validates certificate name">
                {yesNo(backend.tls.validateCertificateName)}
              </Field>
              <Field label="Credentials configured">
                {backend.credentialMechanisms.length > 0
                  ? backend.credentialMechanisms.join(', ')
                  : 'none'}
              </Field>
            </>
          )}
          <Field label="Operations">{operationNames(model, row.operationIds)}</Field>
        </dl>
      ) : (
        <p className="text-muted-foreground">
          {row.missing ? 'This backend does not exist.' : 'Loading…'}
        </p>
      )}
      {row.outbound.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium">How APIM authenticates</h3>
          {row.outbound.map((use, index) => (
            <Outbound key={index} model={model} use={use} />
          ))}
        </div>
      )}
      <FindingList findings={row.findings} />
    </section>
  )
}

/** The backends the API's operations route to, with TLS, credentials and outbound identity. */
export default function Backends({ model }: ViewProps) {
  const rows = backendRows(model)
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {rows.length} backends used by this API. Backends are shown by URL; the Azure resource
        behind them isn't looked up.
        {model.pending.length > 0 && ' · loading…'}
      </p>
      {rows.length === 0 && model.pending.length === 0 && (
        <p className="text-muted-foreground text-sm">No operation routes anywhere yet.</p>
      )}
      {rows.map((row) => (
        <BackendCard key={row.key} model={model} row={row} />
      ))}
    </div>
  )
}
