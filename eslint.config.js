import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import { defineConfig, globalIgnores } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * Layering is one-way: views / scripts → domain → services → lib (see CLAUDE.md › Architecture).
 * Each entry lists the top-level `src/` folders a layer must not import, via the `@/` alias or a
 * relative path. Tests are exempt: they use helpers from `test/` and constants from `services/`.
 */
const LAYERS = [
  { folder: 'lib', forbidden: ['app', 'services', 'domain', 'views', 'scripts', 'components'] },
  { folder: 'services', forbidden: ['app', 'domain', 'views', 'scripts', 'components'] },
  { folder: 'domain', forbidden: ['app', 'views', 'scripts', 'components'] },
  { folder: 'views', forbidden: ['app', 'scripts'] },
  { folder: 'scripts', forbidden: ['app', 'views', 'components'] },
  { folder: 'components', forbidden: ['app', 'views', 'scripts'] },
]

function layerRule({ folder, forbidden }) {
  const names = forbidden.join('|')
  return {
    files: [`src/${folder}/**/*.{ts,tsx}`],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: `^(@/|(\\.\\./)+)(${names})(/|$)`,
              message: `${folder}/ must not import from ${forbidden.join(', ')} (one-way layering, see CLAUDE.md).`,
            },
          ],
        },
      ],
    },
  }
}

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'public/mockServiceWorker.js', 'samples-raw']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  ...LAYERS.map(layerRule),
  {
    // shadcn/ui sources, copied by its CLI: they export style variants (buttonVariants, …) next to
    // the component. Kept as generated so later `shadcn add` updates stay easy to compare.
    files: ['src/components/ui/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  prettier,
])
