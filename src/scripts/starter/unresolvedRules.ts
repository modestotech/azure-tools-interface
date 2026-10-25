import { operationText } from '../operations'
import type { ScriptDefinition } from '../types'

/** Everything outside the supported pattern, with the XML to review by hand. */
export const unresolvedRulesScript: ScriptDefinition = {
  id: 'unresolved-rules',
  title: 'Unresolved rules',
  description:
    'Policy elements outside the supported pattern (choose, fragments, named values, expressions…), to review by hand.',
  params: [],
  run(model) {
    const rows = model.findings.flatMap((finding) => {
      if (finding.kind !== 'unresolved-rule') return []
      const { rule } = finding
      return [
        {
          operation: operationText(model, finding.operationId),
          scope: rule.source.scope,
          section: rule.source.section,
          element: rule.element,
          reason: rule.reason,
          xml: rule.xml,
        },
      ]
    })
    return {
      columns: [
        { key: 'operation', title: 'Operation' },
        { key: 'scope', title: 'Scope' },
        { key: 'section', title: 'Section' },
        { key: 'element', title: 'Element' },
        { key: 'reason', title: 'Reason' },
        { key: 'xml', title: 'XML' },
      ],
      rows,
    }
  },
}
