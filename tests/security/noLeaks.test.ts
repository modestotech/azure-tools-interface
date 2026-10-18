import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Static guard: app code may only reach the network through the HTTP client (which enforces the
 * two Azure hosts and read-only methods), and may never persist anything in the browser.
 * Tests and MSW mocks (`src/test/`) are excluded.
 */

const SRC = path.resolve(import.meta.dirname, '../../src')
const HTTP_CLIENT = 'lib/http/client.ts'

interface Rule {
  readonly pattern: RegExp
  readonly reason: string
  /** Files (relative to `src/`) where the pattern is allowed. */
  readonly allowedIn?: readonly string[]
}

const RULES: readonly Rule[] = [
  {
    pattern: /\bfetch\s*\(/,
    reason: 'network call outside the HTTP client',
    allowedIn: [HTTP_CLIENT],
  },
  { pattern: /\bXMLHttpRequest\b/, reason: 'network call outside the HTTP client' },
  { pattern: /\bWebSocket\b/, reason: 'network call outside the HTTP client' },
  { pattern: /\bEventSource\b/, reason: 'network call outside the HTTP client' },
  { pattern: /\bsendBeacon\b/, reason: 'network call outside the HTTP client' },
  { pattern: /\bnavigator\.serviceWorker\b/, reason: 'service worker registration' },
  { pattern: /\blocalStorage\b/, reason: 'browser storage' },
  { pattern: /\bsessionStorage\b/, reason: 'browser storage' },
  { pattern: /\bindexedDB\b/, reason: 'browser storage' },
  { pattern: /\bcaches\s*\./, reason: 'browser storage (Cache API)' },
  { pattern: /\bdocument\.cookie\b/, reason: 'cookie' },
  { pattern: /\bpersist\b[^;]*['"]zustand\/middleware['"]/, reason: 'persisted Zustand store' },
  { pattern: /['"]@tanstack\/[\w-]*persist[\w-]*['"]/, reason: 'persisted TanStack Query cache' },
]

/** Drops comments so a word like "localStorage" in a doc comment isn't flagged. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

export function findViolations(file: string, source: string): string[] {
  const code = stripComments(source)
  return RULES.filter(
    (rule) => rule.pattern.test(code) && !(rule.allowedIn ?? []).includes(file),
  ).map((rule) => `${file}: ${rule.reason} (${rule.pattern.source})`)
}

function appSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    const rel = path.relative(SRC, full).split(path.sep).join('/')
    if (entry.isDirectory()) return rel === 'test' ? [] : appSourceFiles(full)
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [rel] : []
  })
}

describe('no leaking traffic or storage in app code', () => {
  const files = appSourceFiles(SRC)

  it('scans the app source', () => {
    expect(files).toContain(HTTP_CLIENT)
    expect(files).toContain('main.tsx')
    expect(files.some((f) => f.startsWith('test/'))).toBe(false)
  })

  it('has no network calls outside the HTTP client and no browser persistence', () => {
    const violations = files.flatMap((file) =>
      findViolations(file, readFileSync(path.join(SRC, file), 'utf8')),
    )
    expect(violations).toEqual([])
  })

  it('detects the patterns it guards against', () => {
    const planted = [
      "fetch('https://evil.example.net')",
      'new WebSocket(url)',
      'navigator.sendBeacon(url, data)',
      "localStorage.setItem('t', token)",
      'document.cookie = token',
      "import { persist } from 'zustand/middleware'",
      "import { persistQueryClient } from '@tanstack/react-query-persist-client'",
    ]
    for (const line of planted) {
      expect(findViolations('views/x.tsx', line), line).not.toEqual([])
    }
    expect(findViolations(HTTP_CLIENT, 'fetchImpl(url); globalThis.fetch(url)')).toEqual([])
    expect(findViolations('views/x.tsx', '// localStorage is never used\n/* fetch() */')).toEqual(
      [],
    )
    expect(findViolations('views/x.tsx', "const u = 'https://graph.microsoft.com'")).toEqual([])
  })
})
