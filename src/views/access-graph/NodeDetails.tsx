import type { ReactNode } from 'react'
import type { AccessModel } from '@/domain'
import { FindingList } from '../shared/FindingList'
import { PRINCIPAL_KIND_LABEL, principalLabel, principalReach } from '../shared/reach'
import { authSummary, authText, operationFindings, outboundText } from '../shared/summaries'
import { nodeTitle, type AccessNode } from './elements'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all">{children}</dd>
    </>
  )
}

function operationName(model: AccessModel, operationId: string): string {
  const operation = model.operations.find((item) => item.operation.id === operationId)?.operation
  return operation ? `${operation.method} ${operation.urlTemplate}` : operationId
}

function groupName(model: AccessModel, groupId: string): string {
  const group = model.principals.get(groupId)
  return group ? principalLabel(group) : groupId
}

function PrincipalDetails({
  model,
  node,
}: {
  model: AccessModel
  node: Extract<AccessNode, { kind: 'principal' }>
}) {
  const { principal } = node
  const reach = principalReach(model).find((item) => item.principal.id === principal.id)
  return (
    <>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        <Field label="Type">{PRINCIPAL_KIND_LABEL[principal.kind]}</Field>
        <Field label="Object ID">{principal.id}</Field>
        {(principal.kind === 'servicePrincipal' || principal.kind === 'managedIdentity') && (
          <Field label="App ID">{principal.appId ?? 'loading…'}</Field>
        )}
        {principal.kind === 'user' && principal.userPrincipalName && (
          <Field label="Sign-in name">{principal.userPrincipalName}</Field>
        )}
      </dl>
      <ul className="space-y-1">
        {(reach?.paths ?? []).map((path, index) => (
          <li key={index}>
            <span className="font-mono">{operationName(model, path.operationId)}</span>:{' '}
            {path.kind === 'direct'
              ? `holds ${path.roles.join(', ')}`
              : `through ${groupName(model, path.groupId)} (${path.roles.join(', ')})`}
            {path.kind === 'group' && !path.effective && (
              <span className="text-muted-foreground"> — not effective: {path.reason}</span>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

function OperationDetails({
  model,
  node,
}: {
  model: AccessModel
  node: Extract<AccessNode, { kind: 'operation' }>
}) {
  const { access } = node
  const findings = operationFindings(model, access.operation.id)
  return (
    <>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        <Field label="Name">{access.operation.displayName}</Field>
        <Field label="Auth">{authText(authSummary(access))}</Field>
        <Field label="Outbound auth">{outboundText(access.outbound)}</Field>
      </dl>
      <FindingList findings={findings} />
    </>
  )
}

function BackendDetails({
  model,
  node,
}: {
  model: AccessModel
  node: Extract<AccessNode, { kind: 'backend' }>
}) {
  const { backend } = node
  const operations = model.edges.flatMap((edge) =>
    edge.kind === 'route' && edge.backendKey === node.backendKey ? [edge.operationId] : [],
  )
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
      <Field label="URL">{backend?.url ?? 'unknown'}</Field>
      <Field label="Type">{backend?.type ?? 'unknown'}</Field>
      {backend?.backendId && <Field label="Backend ID">{backend.backendId}</Field>}
      <Field label="Operations">
        {operations.map((id) => operationName(model, id)).join(', ')}
      </Field>
    </dl>
  )
}

/** The selected node: who it is, what it reaches, or where it routes, with its findings. */
export function NodeDetails({ model, node }: { model: AccessModel; node: AccessNode }) {
  return (
    <section
      aria-label={`Details of ${nodeTitle(node)}`}
      className="space-y-3 rounded-md border p-4 text-sm"
    >
      <h2 className="font-medium">{nodeTitle(node)}</h2>
      {node.kind === 'principal' && <PrincipalDetails model={model} node={node} />}
      {node.kind === 'operation' && <OperationDetails model={model} node={node} />}
      {node.kind === 'backend' && <BackendDetails model={model} node={node} />}
    </section>
  )
}
