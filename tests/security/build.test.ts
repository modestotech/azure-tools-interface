import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { build } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Builds the production site (as `pnpm build` does) and checks what would be deployed: no service
 * worker, no external resources in index.html, and no unexpected external URL anywhere in the
 * bundle.
 */

const ROOT = path.resolve(import.meta.dirname, '../..')

/**
 * Every origin allowed to appear in the built files, with the reason. A new origin fails the test,
 * so it gets reviewed before it ships.
 */
const ALLOWED_ORIGINS: Readonly<Record<string, string>> = {
  'https://management.azure.com': 'ARM, the only API the app calls besides Graph',
  'https://graph.microsoft.com': 'Microsoft Graph',
  'http://www.w3.org': 'XML/SVG namespace identifiers in React DOM; never fetched',
  'https://react.dev': 'link text in React error messages; never fetched',
  'https://tailwindcss.com': 'license comment in the CSS; never fetched',
  'https://management.core.windows.net':
    'an accepted ARM token audience (API_RESOURCES), compared with the aud claim; never fetched',
  'https://json-schema.org':
    "$schema identifier in Zod's toJSONSchema (bundled, unused); never fetched",
  'http://json-schema.org':
    "$schema identifier in Zod's toJSONSchema (bundled, unused); never fetched",
}

let outDir: string

function builtFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? builtFiles(full) : [path.relative(outDir, full)]
  })
}

beforeAll(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'apim-mapper-dist-'))
  // Vitest sets NODE_ENV=test, which would bundle React's development build. Build exactly what
  // `pnpm build` deploys.
  const nodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    await build({
      root: ROOT,
      mode: 'production',
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true },
    })
  } finally {
    if (nodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = nodeEnv
  }
}, 120_000)

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true })
})

describe('production build', () => {
  it('does not ship the MSW service worker', () => {
    const files = builtFiles(outDir)
    expect(files).toContain('index.html')
    expect(files).not.toContain('mockServiceWorker.js')
  })

  it('loads nothing external from index.html', () => {
    const html = readFileSync(path.join(outDir, 'index.html'), 'utf8')
    const refs = [...html.matchAll(/\b(?:src|href)="([^"]*)"/g)].map((m) => m[1])
    expect(refs.length).toBeGreaterThan(0)
    for (const ref of refs) {
      expect(ref, ref).toMatch(/^\/(?!\/)/)
    }
  })

  it('contains no external URLs besides the allowlisted origins', () => {
    const found = new Map<string, string>()
    for (const file of builtFiles(outDir)) {
      const text = readFileSync(path.join(outDir, file), 'utf8')
      for (const [url] of text.matchAll(
        /(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}(?=[/"'`\s)?:]|$)/gi,
      )) {
        const origin = url.startsWith('//') ? `https:${url}` : url
        if (!(origin in ALLOWED_ORIGINS)) found.set(origin, file)
      }
    }
    expect(Object.fromEntries(found)).toEqual({})
  })
})
