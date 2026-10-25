import {
  ANALYZED_SECTIONS,
  type AccessRule,
  type DroppedParent,
  type OperationPolicy,
  type PolicyDocument,
  type PolicyScope,
  type UnresolvedRule,
} from '../model'
import { composeSection, type ScopedSection } from './compose'
import { classifyElement } from './elements'
import { toXml } from './xmlTree'

/** The policy documents that apply to one operation. Absent: no policy at that scope. */
export interface OperationDocuments {
  readonly global?: PolicyDocument | undefined
  readonly api?: PolicyDocument | undefined
  readonly operation?: PolicyDocument | undefined
}

/** A document that couldn't be read is unresolved itself: its rules are unknown. */
function unreadable(document: PolicyDocument, error: string): UnresolvedRule {
  return {
    source: { scope: document.scope, section: 'inbound' },
    element: 'policies',
    xml: document.xml,
    reason: `The ${document.scope} policy could not be read: ${error}`,
  }
}

/**
 * The effective `inbound` and `backend` rules of one operation: `<base />` composition over
 * global → API → operation, then every element classified. `outbound` and `on-error` are not
 * analyzed, so nothing in them becomes a rule or an unresolved rule.
 */
export function analyzeOperationPolicy(
  operationId: string,
  documents: OperationDocuments,
): OperationPolicy {
  const chain = [documents.global, documents.api, documents.operation].filter(
    (document): document is PolicyDocument => document !== undefined,
  )
  const rules: AccessRule[] = []
  const unresolved: UnresolvedRule[] = []
  const droppedParents: DroppedParent[] = []
  const unreadableScopes: PolicyScope[] = []

  for (const document of chain) {
    if (document.parsed.ok) continue
    unresolved.push(unreadable(document, document.parsed.error))
    unreadableScopes.push(document.scope)
  }

  for (const section of ANALYZED_SECTIONS) {
    const scoped: ScopedSection[] = chain.map((document) => ({
      scope: document.scope,
      section: document.parsed.ok ? document.parsed.sections[section] : undefined,
    }))
    const composed = composeSection(scoped)
    droppedParents.push(...composed.withoutBase.map((scope) => ({ section, scope })))
    for (const { scope, element } of composed.elements) {
      const source = { scope, section }
      const outcome = classifyElement(element, source)
      if (outcome.kind === 'rule') rules.push(outcome.rule)
      else if (outcome.kind === 'unresolved') {
        unresolved.push({
          source,
          element: element.name,
          xml: toXml(element),
          reason: outcome.reason,
        })
      }
    }
  }
  return { operationId, rules, unresolved, droppedParents, unreadable: unreadableScopes }
}
