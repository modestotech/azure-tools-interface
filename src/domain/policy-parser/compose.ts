import type { PolicyScope, XmlElement } from '../model'
import { childElements } from './xmlTree'

/**
 * `<base />` composition, the same for all four sections. A section's own elements replace its
 * `<base />` with everything above it; a section without `<base />` drops its parent entirely.
 */

/** One scope's version of a section. `undefined`: that scope doesn't define the section. */
export interface ScopedSection {
  readonly scope: PolicyScope
  readonly section: XmlElement | undefined
}

/** An element of the effective section, with the scope it came from. */
export interface SourcedElement {
  readonly scope: PolicyScope
  readonly element: XmlElement
}

export interface ComposedSection {
  readonly elements: readonly SourcedElement[]
  /** Scopes whose section has no `<base />`, so the sections above them (and products) are dropped. */
  readonly withoutBase: readonly PolicyScope[]
}

const isBase = (element: XmlElement) => element.name === 'base'

/**
 * Composes one section along `chain`, outermost first (global → API → operation). A scope that
 * doesn't define the section inherits it unchanged. Only the first `<base />` in a section is
 * expanded; APIM itself rejects a second one.
 */
export function composeSection(chain: readonly ScopedSection[]): ComposedSection {
  let elements: SourcedElement[] = []
  const withoutBase: PolicyScope[] = []
  for (const { scope, section } of chain) {
    if (!section) continue
    const own = childElements(section)
    const baseAt = own.findIndex(isBase)
    const sourced = (items: XmlElement[]) =>
      items.filter((e) => !isBase(e)).map((element) => ({ scope, element }))
    if (baseAt === -1) {
      // The global scope has no parent in APIM's sense to drop.
      if (scope !== 'global') withoutBase.push(scope)
      elements = sourced(own)
    } else {
      elements = [...sourced(own.slice(0, baseAt)), ...elements, ...sourced(own.slice(baseAt + 1))]
    }
  }
  return { elements, withoutBase }
}
