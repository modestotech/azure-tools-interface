import { callersByOperation, PRINCIPAL_KIND_LABEL, principalLabel } from '@/domain'
import { appendTo } from '@/lib/collections'
import { operationLookup } from '../operations'
import type { ScriptDefinition } from '../types'

/** Operations named per row; a principal reaching hundreds gets the rest counted. */
const NAMED_OPERATIONS = 10

/**
 * Principals that can call many operations: candidates for narrower roles. Read from
 * `callersByOperation()` turned around, rather than from `principalReach()`, which builds a path
 * per group member per operation and is slow on a large tenant.
 */
export const broadAccessScript: ScriptDefinition = {
  id: 'broad-access',
  title: 'Principals with access to more than N operations',
  description:
    'Apps, managed identities and users that can call more than N operations of the API.',
  params: [{ key: 'n', label: 'More than N operations', default: 1, min: 0 }],
  run(model, params) {
    const n = params.n ?? 1
    const lookup = operationLookup(model)
    const reached = new Map<string, string[]>()
    for (const [operationId, callers] of callersByOperation(model)) {
      for (const id of callers) appendTo(reached, id, operationId)
    }
    const groups = new Map<string, string[]>()
    for (const edge of model.edges) {
      if (edge.kind === 'membership' && edge.effective) {
        const group = model.principals.get(edge.groupId)
        appendTo(groups, edge.memberId, group ? principalLabel(group) : edge.groupId)
      }
    }
    const rows = [...reached].flatMap(([id, operations]) => {
      const principal = model.principals.get(id)
      if (!principal || operations.length <= n) return []
      return [
        {
          name: principalLabel(principal),
          type: PRINCIPAL_KIND_LABEL[principal.kind],
          id,
          operations: operations.length,
          through: (groups.get(id) ?? []).join(', '),
          reaches: lookup.list(operations, NAMED_OPERATIONS),
        },
      ]
    })
    return {
      columns: [
        { key: 'name', title: 'Name' },
        { key: 'type', title: 'Type' },
        { key: 'operations', title: 'Operations' },
        { key: 'through', title: 'Through groups' },
        { key: 'reaches', title: 'Reaches' },
        { key: 'id', title: 'Object ID' },
      ],
      rows: rows.sort((a, b) => b.operations - a.operations || a.name.localeCompare(b.name)),
    }
  },
}
