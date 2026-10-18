import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

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

/** Tests that need a DOM: React components (`.tsx`) and the app shell, which uses browser APIs. */
const DOM_TESTS = ['src/**/*.test.tsx', 'src/app/**/*.test.ts']

export default defineConfig({
  plugins: [react(), tailwindcss(), dropMockServiceWorker()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
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
