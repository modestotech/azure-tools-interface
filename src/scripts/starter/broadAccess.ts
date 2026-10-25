import { PRINCIPAL_KIND_LABEL, principalLabel, principalReach, reachedOperationIds } from '@/domain'
import { operationsText } from '../operations'
import type { ScriptDefinition } from '../types'

/** Principals that can call many operations: candidates for narrower roles. */
export const broadAccessScript: ScriptDefinition = {
  id: 'broad-access',
  title: 'Principals with access to more than N operations',
  description:
    'Apps, managed identities and users that can call more than N operations of the API.',
  params: [{ key: 'n', label: 'More than N operations', default: 1, min: 0 }],
  run(model, params) {
    const n = params.n ?? 1
    const rows = principalReach(model).flatMap((entry) => {
      const { principal, paths } = entry
      if (principal.kind === 'group') return []
      const operations = reachedOperationIds(entry)
      if (operations.size <= n) return []
      const groups = new Set(
        paths.flatMap((path) => (path.kind === 'group' && path.effective ? [path.groupId] : [])),
      )
      return [
        {
          name: principalLabel(principal),
          type: PRINCIPAL_KIND_LABEL[principal.kind],
          id: principal.id,
          operations: operations.size,
          through: [...groups]
            .map((id) => {
              const group = model.principals.get(id)
              return group ? principalLabel(group) : id
            })
            .join(', '),
          reaches: operationsText(model, operations),
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
      rows: rows.sort((a, b) => b.operations - a.operations),
    }
  },
}
