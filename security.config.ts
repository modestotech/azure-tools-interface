/**
 * The site's one Content Security Policy and hosting headers, used by the build for both the
 * `<meta>` tag in index.html and `staticwebapp.config.json` › `globalHeaders`. Not applied to
 * `pnpm dev`: Vite's hot reload needs inline scripts and a websocket.
 */

/**
 * ARM and Graph, the only places the app sends anything. Must equal the origins in API_RESOURCES
 * (`src/lib/token/resources.ts`); tests/security/build.test.ts fails if they drift. Listed here
 * rather than imported, so the Vite config loads no app code.
 */
export const API_ORIGINS = ['https://management.azure.com', 'https://graph.microsoft.com']

export const CSP_DIRECTIVES: Readonly<Record<string, readonly string[]>> = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'img-src': ["'self'"],
  'font-src': ["'self'"],
  'connect-src': ["'self'", ...API_ORIGINS],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
  'frame-ancestors': ["'none'"],
}

/** Browsers ignore these in a `<meta>` tag, so they're only sent as a header. */
const HEADER_ONLY_DIRECTIVES = new Set(['frame-ancestors'])

function serialize(include: (directive: string) => boolean): string {
  return Object.entries(CSP_DIRECTIVES)
    .filter(([directive]) => include(directive))
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ')
}

export const CSP_HEADER = serialize(() => true)
export const CSP_META = serialize((directive) => !HEADER_ONLY_DIRECTIVES.has(directive))

/** Azure Static Web Apps configuration: client-side routing fallback plus the security headers. */
export const STATIC_WEB_APP_CONFIG = {
  navigationFallback: {
    rewrite: '/index.html',
    exclude: ['/assets/*', '/*.{js,css,svg,png,ico,json}'],
  },
  globalHeaders: {
    'Content-Security-Policy': CSP_HEADER,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  },
}
