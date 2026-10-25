/**
 * The pickers' search: case-insensitive, matching anywhere in the text. `*` stands for any run of
 * characters, so `02` finds `APIM0002` and `apim*orepay` finds `APIM0002 - Orepay …`. No fuzzy
 * matching: an option either contains what was typed or it doesn't.
 */

const escapeRegExp = (text: string) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&')

export function matchesSearch(text: string, search: string): boolean {
  const query = search.trim().toLowerCase()
  if (!query) return true
  const haystack = text.toLowerCase()
  if (!query.includes('*')) return haystack.includes(query)
  const pattern = query.split('*').map(escapeRegExp).join('.*')
  return new RegExp(pattern).test(haystack)
}
