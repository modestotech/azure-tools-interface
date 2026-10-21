import {
  POLICY_SECTIONS,
  type PolicyDocument,
  type PolicyScope,
  type PolicySection,
  type XmlElement,
} from '../model'
import { childNamed, parseXml } from './xmlTree'

/** Reads a policy document (`<policies>` with up to four sections) into a PolicyDocument. */
export function parsePolicyDocument(
  scope: PolicyScope,
  xml: string,
  operationId?: string,
): PolicyDocument {
  const result = parseXml(xml)
  if (!result.ok) return { scope, operationId, xml, parsed: result }
  if (result.root.name !== 'policies') {
    return {
      scope,
      operationId,
      xml,
      parsed: { ok: false, error: 'Root element is not <policies>.' },
    }
  }
  const { root } = result
  const sections: Partial<Record<PolicySection, XmlElement>> = {}
  for (const section of POLICY_SECTIONS) {
    const element = childNamed(root, section)
    if (element) sections[section] = element
  }
  return { scope, operationId, xml, parsed: { ok: true, sections } }
}
