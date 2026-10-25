import { AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { maskText } from '@/lib/http'
import { useSession } from '../session/sessionStore'

/**
 * Shown when the analysis or a view fails to render. Session and scope stay usable above it, and
 * the message is masked like the request log, since it can quote a URL.
 */
export function AnalysisError({ error, reset }: { error: Error; reset: () => void }) {
  const subscriptionId = useSession((state) => state.subscriptionId)
  const tenantId = useSession((state) => state.tenantId)
  return (
    <Alert variant="destructive" role="alert">
      <AlertTriangle />
      <AlertTitle>This part of the analysis failed to load</AlertTitle>
      <AlertDescription className="space-y-2">
        <p className="font-mono break-all">
          {maskText(`${error.name}: ${error.message}`, { subscriptionId, tenantId })}
        </p>
        <p>
          Your tokens and choices are kept. Try again, pick another view or API, or check the
          browser console for details.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={reset}>
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  )
}
