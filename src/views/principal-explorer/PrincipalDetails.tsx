import { Badge } from '@/components/ui/badge'
import type { AccessModel } from '@/domain'
import {
  canCall,
  PRINCIPAL_KIND_LABEL,
  principalLabel,
  type PrincipalReach,
  type ReachPath,
} from '../shared/reach'

function operationName(model: AccessModel, operationId: string) {
  return model.operations.find((item) => item.operation.id === operationId)?.operation
}

function why(model: AccessModel, path: ReachPath): string {
  const roles = path.roles.join(', ')
  if (path.kind === 'direct') return `holds ${roles}`
  const group = model.principals.get(path.groupId)
  return `member of ${group ? principalLabel(group) : path.groupId}, which holds ${roles}`
}

/** A group's direct members, with whether the group's roles reach them. */
function Members({ model, groupId }: { model: AccessModel; groupId: string }) {
  const members = model.edges.flatMap((edge) =>
    edge.kind === 'membership' && edge.groupId === groupId ? [edge] : [],
  )
  if (members.length === 0) return <p className="text-muted-foreground">No direct members.</p>
  return (
    <ul className="space-y-1">
      {members.map((edge) => {
        const member = model.principals.get(edge.memberId)
        return (
          <li key={edge.memberId} className={edge.effective ? undefined : 'text-muted-foreground'}>
            {member ? principalLabel(member) : edge.memberId}
            {member && ` (${PRINCIPAL_KIND_LABEL[member.kind]})`}
            {!edge.effective && ` — not effective: ${edge.reason ?? ''}`}
          </li>
        )
      })}
    </ul>
  )
}

/** The selected principal: who it is, and every operation it reaches with the reason. */
export function PrincipalDetails({ model, entry }: { model: AccessModel; entry: PrincipalReach }) {
  const { principal, paths } = entry
  const isGroup = principal.kind === 'group'
  return (
    <section
      aria-label={`Details of ${principalLabel(principal)}`}
      className="space-y-3 rounded-md border p-4 text-sm"
    >
      <h2 className="font-medium">{principalLabel(principal)}</h2>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">Type</dt>
        <dd>{PRINCIPAL_KIND_LABEL[principal.kind]}</dd>
        <dt className="text-muted-foreground">Object ID</dt>
        <dd className="break-all">{principal.id}</dd>
        {(principal.kind === 'servicePrincipal' || principal.kind === 'managedIdentity') && (
          <>
            <dt className="text-muted-foreground">App ID</dt>
            <dd className="break-all">{principal.appId ?? 'loading…'}</dd>
          </>
        )}
        {principal.kind === 'user' && principal.userPrincipalName && (
          <>
            <dt className="text-muted-foreground">Sign-in name</dt>
            <dd className="break-all">{principal.userPrincipalName}</dd>
          </>
        )}
      </dl>
      <h3 className="font-medium">{isGroup ? 'Grants its members' : 'Operations'}</h3>
      {paths.length === 0 ? (
        <p className="text-muted-foreground">No access to any operation of this API.</p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-1 pr-3 font-normal">Operation</th>
              <th className="py-1 pr-3 font-normal">Why</th>
              <th className="py-1 font-normal">Can call</th>
            </tr>
          </thead>
          <tbody>
            {paths.map((path, index) => {
              const operation = operationName(model, path.operationId)
              const callable = isGroup || canCall(principal, path)
              return (
                <tr key={index} className="border-t align-top">
                  <td className="py-1 pr-3">
                    <span className="font-mono">
                      {operation
                        ? `${operation.method} ${operation.urlTemplate}`
                        : path.operationId}
                    </span>
                    {operation && (
                      <span className="text-muted-foreground block text-xs">
                        {operation.displayName}
                      </span>
                    )}
                  </td>
                  <td className="py-1 pr-3">
                    {why(model, path)}
                    {path.kind === 'group' && !path.effective && (
                      <span className="text-muted-foreground block text-xs">{path.reason}</span>
                    )}
                  </td>
                  <td className="py-1">
                    {isGroup ? (
                      <Badge variant="outline">members</Badge>
                    ) : callable ? (
                      <Badge variant="secondary">yes</Badge>
                    ) : (
                      <Badge variant="outline">no</Badge>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {isGroup && (
        <>
          <h3 className="font-medium">Direct members</h3>
          <Members model={model} groupId={principal.id} />
        </>
      )}
    </section>
  )
}
