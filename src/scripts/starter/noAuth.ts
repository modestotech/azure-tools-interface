import type { ScriptDefinition } from '../types'
import { operationLookup } from '../operations'

/** Operations anyone can call: no `validate-jwt` at all, or one that requires no role. */
export const noAuthScript: ScriptDefinition = {
  id: 'no-auth',
  title: 'Operations with no auth',
  description: 'Operations with no validate-jwt at any scope, or one that requires no role.',
  params: [],
  needsEntra: false,
  run(model) {
    const operations = operationLookup(model)
    const rows = model.findings.flatMap((finding) => {
      if (finding.kind !== 'no-auth' && finding.kind !== 'no-role-requirement') return []
      const operation = operations.byId(finding.operationId)
      return [
        {
          method: operation?.method,
          path: operation?.urlTemplate,
          name: operation?.displayName ?? finding.operationId,
          issue: finding.kind === 'no-auth' ? 'no validate-jwt' : 'token, no role required',
        },
      ]
    })
    return {
      columns: [
        { key: 'method', title: 'Method' },
        { key: 'path', title: 'Path' },
        { key: 'name', title: 'Name' },
        { key: 'issue', title: 'Issue' },
      ],
      rows,
    }
  },
}
