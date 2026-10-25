import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { build } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { API_RESOURCES } from '../../src/lib/token/resources'
import { API_ORIGINS } from '../../security.config'

/**
 * Builds the production site (as `pnpm build` does) and checks what would be deployed: no service
 * worker, no external resources in index.html, no unexpected external URL anywhere in the bundle,
 * and the Content Security Policy and security headers.
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
  'http://www.eclipse.org':
    'EMF/ELK namespace identifiers inside elkjs (the access graph layout); never fetched',
  'https://reactflow.dev':
    "React Flow's attribution link text; the view hides the attribution panel; never fetched",
  'https://rolldown.rs':
    "error text in the bundler's require shim, referenced by elkjs's browserify wrapper; never fetched",
}

/**
 * The policy the site must ship, written out here rather than read from security.config.ts, so a
 * change to the config has to be made in this test too, on purpose.
 */
const EXPECTED_CSP: Readonly<Record<string, string>> = {
  'default-src': "'self'",
  'script-src': "'self'",
  'style-src': "'self'",
  'img-src': "'self'",
  'font-src': "'self'",
  'connect-src': "'self' https://management.azure.com https://graph.microsoft.com",
  'object-src': "'none'",
  'base-uri': "'none'",
  'form-action': "'none'",
}

/** `a x; b y z` → `{ a: 'x', b: 'y z' }`. */
function directives(policy: string): Record<string, string> {
  return Object.fromEntries(
    policy
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name = '', ...sources] = part.split(/\s+/)
        return [name, sources.join(' ')]
      }),
  )
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

  it('applies the Content Security Policy in index.html before anything loads', () => {
    const html = readFileSync(path.join(outDir, 'index.html'), 'utf8')
    const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)
    expect(meta, 'CSP meta tag').not.toBeNull()
    expect(directives(meta?.[1] ?? '')).toEqual(EXPECTED_CSP)
    const loads = html.search(/<(script|link)\b/)
    expect(meta?.index ?? Infinity).toBeLessThan(loads)
  })

  it('sends the same policy, plus frame-ancestors, and the security headers', () => {
    const config = JSON.parse(
      readFileSync(path.join(outDir, 'staticwebapp.config.json'), 'utf8'),
    ) as {
      navigationFallback: { rewrite: string }
      globalHeaders: Record<string, string>
    }
    const headers = config.globalHeaders
    expect(directives(headers['Content-Security-Policy'] ?? '')).toEqual({
      ...EXPECTED_CSP,
      'frame-ancestors': "'none'",
    })
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBe('no-referrer')
    expect(config.navigationFallback.rewrite).toBe('/index.html')
  })

  it('allows connecting to exactly the API origins the app uses', () => {
    const appOrigins = Object.values(API_RESOURCES).map((resource) => resource.origin)
    expect([...API_ORIGINS].sort()).toEqual([...appOrigins].sort())
  })
})
