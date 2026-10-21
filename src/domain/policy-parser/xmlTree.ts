import { XMLParser } from 'fast-xml-parser'
import { SyntaxValidator } from 'fast-xml-validator'
import type { XmlElement, XmlNode, XmlText } from '../model'

/**
 * A typed view of fast-xml-parser's `preserveOrder` output, so extractors never touch its raw
 * nested arrays. Order matters: `<base />` placement and "the last `set-backend-service` wins"
 * depend on it.
 */

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  // Keep values as written: an audience or role that looks like a number is still a string.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
})

const ATTRIBUTES_KEY = ':@'
const TEXT_KEY = '#text'

type RawNode = Record<string, unknown>

function isRecord(value: unknown): value is RawNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toAttributes(raw: unknown): Record<string, string> {
  if (!isRecord(raw)) return {}
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, String(value)]))
}

function toNode(raw: unknown): XmlNode | undefined {
  if (!isRecord(raw)) return undefined
  if (TEXT_KEY in raw) return { text: String(raw[TEXT_KEY]) }
  const name = Object.keys(raw).find((key) => key !== ATTRIBUTES_KEY)
  if (name === undefined) return undefined
  const children = raw[name]
  return {
    name,
    attributes: toAttributes(raw[ATTRIBUTES_KEY]),
    children: Array.isArray(children) ? toNodes(children) : [],
  }
}

function toNodes(raw: readonly unknown[]): XmlNode[] {
  return raw.map(toNode).filter((node): node is XmlNode => node !== undefined)
}

/** Why `xml` isn't well-formed, or undefined if it is. The validator throws on the first error. */
function syntaxError(xml: string): string | undefined {
  try {
    SyntaxValidator.validate(xml)
    return undefined
  } catch (error) {
    const line =
      isRecord(error) && typeof error.line === 'number' ? ` at line ${String(error.line)}` : ''
    return `Invalid XML${line}: ${error instanceof Error ? error.message : String(error)}`
  }
}

export type XmlParseResult =
  { readonly ok: true; readonly root: XmlElement } | { readonly ok: false; readonly error: string }

/** Parses a document with a single root element. Invalid XML is an error, never a guess. */
export function parseXml(xml: string): XmlParseResult {
  const invalid = syntaxError(xml)
  if (invalid) return { ok: false, error: invalid }
  const roots = toNodes(parser.parse(xml) as unknown[]).filter(isElement)
  const [root] = roots
  if (!root || roots.length > 1) return { ok: false, error: 'Expected exactly one root element.' }
  return { ok: true, root }
}

export function isElement(node: XmlNode): node is XmlElement {
  return 'name' in node
}

/** Child elements, in document order. */
export function childElements(element: XmlElement): XmlElement[] {
  return element.children.filter(isElement)
}

export function childrenNamed(element: XmlElement, name: string): XmlElement[] {
  return childElements(element).filter((child) => child.name === name)
}

export function childNamed(element: XmlElement, name: string): XmlElement | undefined {
  return childElements(element).find((child) => child.name === name)
}

/** The element's own text (not its descendants'), trimmed. */
export function textOf(element: XmlElement): string {
  return element.children
    .filter((node): node is XmlText => !isElement(node))
    .map((node) => node.text)
    .join('')
    .trim()
}

/** Every attribute value and text in the element and its descendants. */
export function allValues(element: XmlElement): string[] {
  return [
    ...Object.values(element.attributes),
    ...element.children.flatMap((node) => (isElement(node) ? allValues(node) : [node.text])),
  ]
}

const escapeText = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const escapeAttribute = (value: string) => escapeText(value).replace(/"/g, '&quot;')

/** Serializes an element back to XML, for "needs manual review" snippets. Comments are gone. */
export function toXml(element: XmlElement, indent = ''): string {
  const attributes = Object.entries(element.attributes)
    .map(([key, value]) => ` ${key}="${escapeAttribute(value)}"`)
    .join('')
  const open = `${indent}<${element.name}${attributes}`
  if (element.children.length === 0) return `${open} />`
  const [only] = element.children
  if (element.children.length === 1 && only && !isElement(only)) {
    return `${open}>${escapeText(only.text)}</${element.name}>`
  }
  const inner = element.children
    .map((node) =>
      isElement(node) ? toXml(node, `${indent}  `) : `${indent}  ${escapeText(node.text)}`,
    )
    .join('\n')
  return `${open}>\n${inner}\n${indent}</${element.name}>`
}
