import { installNetworkGuard } from '@/lib/http/networkGuard'

/**
 * Loaded as its own module script, before the app's (index.html), so the browser's network APIs
 * are wrapped before any app or library code runs. See `lib/http/networkGuard.ts`.
 */
installNetworkGuard()
