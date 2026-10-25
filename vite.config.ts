import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { CSP_META, STATIC_WEB_APP_CONFIG } from './security.config.ts'

/**
 * `public/mockServiceWorker.js` is only needed by `pnpm dev:demo`. Vite copies everything in
 * `public/` into `dist/`, so remove it from every build except demo mode: the deployed site must
 * not ship a service worker.
 */
function dropMockServiceWorker(): Plugin {
  let workerPath: string | undefined
  return {
    name: 'drop-mock-service-worker',
    apply: 'build',
    configResolved(config) {
      workerPath =
        config.mode === 'demo'
          ? undefined
          : path.resolve(config.root, config.build.outDir, 'mockServiceWorker.js')
    },
    async closeBundle() {
      if (workerPath) await rm(workerPath, { force: true })
    },
  }
}

const CHARSET_META = '<meta charset="UTF-8" />'

/**
 * Builds only: puts the Content Security Policy right after `<meta charset>` in index.html, before
 * any script or stylesheet, and writes staticwebapp.config.json with the same policy as a header.
 * Both come from security.config.ts.
 */
function securityHeaders(): Plugin {
  return {
    name: 'security-headers',
    apply: 'build',
    transformIndexHtml(html) {
      if (!html.includes(CHARSET_META)) throw new Error(`index.html must contain ${CHARSET_META}`)
      const csp = `<meta http-equiv="Content-Security-Policy" content="${CSP_META}" />`
      return html.replace(CHARSET_META, `${CHARSET_META}\n    ${csp}`)
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'staticwebapp.config.json',
        source: `${JSON.stringify(STATIC_WEB_APP_CONFIG, null, 2)}\n`,
      })
    },
  }
}

/** Tests that need a DOM: React components (`.tsx`) and the app shell, which uses browser APIs. */
const DOM_TESTS = ['src/**/*.test.tsx', 'src/app/**/*.test.ts']

export default defineConfig({
  plugins: [react(), tailwindcss(), dropMockServiceWorker(), securityHeaders()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Unused by the app and not browser-safe: see the stub.
      'detailed-xml-validator': fileURLToPath(
        new URL('./stubs/detailed-xml-validator.js', import.meta.url),
      ),
    },
  },
  build: {
    // elkjs is one 1.4 MB GWT-compiled file, and only the access graph (lazy) loads it. The app's
    // own chunks stay well under Vite's default 500 kB.
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // React rarely changes between releases, so it gets its own long-cached file. This also
          // keeps the app's own chunk under Vite's 500 kB warning. The heavy view libraries get
          // their own files too, loaded only by the views that use them.
          groups: [
            { name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'elkjs', test: /[\\/]node_modules[\\/]elkjs[\\/]/ },
            {
              name: 'echarts',
              test: /[\\/]node_modules[\\/](echarts|zrender|echarts-for-react)[\\/]/,
            },
            { name: 'react-flow', test: /[\\/]node_modules[\\/]@xyflow[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Bundled by Vite in tests too, so the alias above applies there as it does in the browser.
    server: { deps: { inline: ['fast-xml-validator'] } },
    // Creating a jsdom environment is the slowest part of a test file, and most tests (lib,
    // services, domain, security) don't need a DOM. Only React and browser-API tests get jsdom.
    projects: [
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.dom.ts'],
          include: DOM_TESTS,
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
          exclude: DOM_TESTS,
        },
      },
    ],
  },
})
