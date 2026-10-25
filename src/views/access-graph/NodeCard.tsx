import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { SeverityBadge } from '@/components/SeverityBadge'
import { cn } from '@/lib/utils'
import { PRINCIPAL_KIND_LABEL } from '../shared/reach'
import { nodeTitle, type AccessNode } from './elements'

export type FlowNode = Node<
  { readonly node: AccessNode; readonly onToggleGroup: (groupId: string) => void },
  'access'
>

function subtitle(node: AccessNode): string {
  switch (node.kind) {
    case 'principal': {
      const { principal } = node
      if (principal.kind === 'user') return principal.userPrincipalName ?? 'User'
      if (principal.kind === 'group') return `Group · ${String(node.members ?? 0)} direct members`
      if (principal.kind === 'other') return 'Other'
      return `${PRINCIPAL_KIND_LABEL[principal.kind]}${principal.appId ? ` · ${principal.appId}` : ''}`
    }
    case 'operation':
      return node.access.operation.displayName
    case 'backend':
      return node.backend?.url ?? (node.backend ? 'no URL' : 'not loaded')
  }
}

/** One node: a principal, an operation or a backend, with handles on both sides. */
export function NodeCard({ data, selected }: NodeProps<FlowNode>) {
  const { node, onToggleGroup } = data
  const group =
    node.kind === 'principal' && node.principal.kind === 'group' && (node.members ?? 0) > 0
      ? node
      : undefined
  return (
    <div
      className={cn(
        'bg-card text-card-foreground flex h-16 w-60 flex-col justify-center rounded-md border px-3 text-xs',
        selected && 'ring-ring ring-2',
        node.kind === 'operation' && 'border-primary/40',
      )}
    >
      {node.column > 0 && <Handle type="target" position={Position.Left} />}
      <div className="flex items-center gap-1">
        <span className="truncate font-medium">{nodeTitle(node)}</span>
        {node.kind === 'operation' && node.severity && (
          <SeverityBadge severity={node.severity}>{node.severity}</SeverityBadge>
        )}
      </div>
      <span className="text-muted-foreground truncate">{subtitle(node)}</span>
      {group && (
        <button
          type="button"
          // React Flow ignores drags and pans that start on `nodrag nopan` elements.
          className="nodrag nopan text-primary self-start underline"
          onClick={(event) => {
            event.stopPropagation()
            onToggleGroup(group.principal.id)
          }}
        >
          {group.expanded ? 'Hide members' : 'Show members'}
        </button>
      )}
      {node.column < 3 && <Handle type="source" position={Position.Right} />}
    </div>
  )
}
