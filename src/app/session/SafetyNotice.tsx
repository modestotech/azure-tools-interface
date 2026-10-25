import { ShieldCheck } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { API_RESOURCES } from '@/lib/token'

const HOSTS = Object.values(API_RESOURCES).map((resource) => new URL(resource.origin).host)

/**
 * Shown above the token fields (PROJECT_PLAN.md › M4). Starts folded to its title, so the token
 * fields come first; the title stays visible and opens the details.
 */
export function SafetyNotice() {
  return (
    <Alert role="note">
      <ShieldCheck />
      <details className="group col-start-2">
        <summary className="cursor-pointer">
          <AlertTitle className="inline">How your tokens are handled</AlertTitle>
          <span className="text-muted-foreground group-open:hidden">
            {' '}
            · not saved, sent only to Azure, read-only
          </span>
        </summary>
        <AlertDescription className="mt-2">
          <ul className="list-disc space-y-1 pl-4">
            <li>
              <strong>Not saved.</strong> Tokens stay in this tab&apos;s memory only: nothing goes
              to local storage, session storage, cookies or the URL. Reloading or closing the tab
              erases them, and <em>Clear session</em> does the same right away, wiping tokens and
              all fetched data.
            </li>
            <li>
              <strong>Not sent anywhere else.</strong> Tokens go only to {HOSTS.join(' and ')},
              straight from your browser. There is no backend, no telemetry and no third-party
              script, and the page&apos;s Content Security Policy blocks every other destination.
            </li>
            <li>
              <strong>Read-only app.</strong> It only sends GET requests (plus Graph $batch, which
              only wraps GETs).
            </li>
            <li>
              <strong>Use a read-only account.</strong> The app being read-only doesn&apos;t limit
              what a token <em>could</em> do: an az token carries all of the signed-in user&apos;s
              permissions. Prefer an account with only Reader (or API Management Service Reader
              Role) on the APIM instance plus directory read in Entra, and no write or Owner roles.
            </li>
            <li>
              <strong>Verify it yourself.</strong> Open DevTools › Network and check that every
              request goes to those two hosts.
            </li>
          </ul>
        </AlertDescription>
      </details>
    </Alert>
  )
}
