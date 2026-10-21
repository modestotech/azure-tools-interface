import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  parseApimServiceId,
  useApimServices,
  useApis,
  useSubscriptions,
  type ArmApi,
  type ArmApimService,
  type ArmSubscription,
} from '@/services/arm'
import type { ResourceResult } from '@/services/result'
import { selectionStore, useSelection } from '../session/selectionStore'
import { sessionStore, useSession } from '../session/sessionStore'
import { Picker } from './Picker'

/** Only current revisions are offered; an old revision's policies aren't what callers hit. */
function currentApis(result: ResourceResult<ArmApi[]> | undefined) {
  return result?.status === 'ok'
    ? { ...result, data: result.data.filter((api) => api.isCurrent) }
    : result
}

/** The three required steps: subscription → APIM instance → API. No "all APIs" option. */
export function ScopePicker() {
  const hasArmToken = useSession((state) => state.tokens.arm !== '')
  const subscriptionId = useSession((state) => state.subscriptionId)
  const service = useSelection((state) => state.service)
  const api = useSelection((state) => state.api)

  const subscriptions = useSubscriptions(hasArmToken).data
  const services = useApimServices(subscriptionId || undefined).data
  const apis = currentApis(useApis(service).data)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scope</CardTitle>
        <CardDescription>Pick one API. The analysis covers that API only.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <Picker<ArmSubscription>
          id="pick-subscription"
          label="Subscription"
          waitingFor={hasArmToken ? undefined : 'Paste an ARM token first.'}
          result={subscriptions}
          toOption={(sub) => ({
            value: sub.subscriptionId,
            label: `${sub.displayName} (${sub.subscriptionId.slice(0, 8)}…)`,
          })}
          value={subscriptionId || undefined}
          onChange={(sub) => {
            sessionStore.getState().setSubscriptionId(sub?.subscriptionId ?? '')
          }}
        />
        <Picker<ArmApimService>
          id="pick-service"
          label="APIM instance"
          waitingFor={subscriptionId ? undefined : 'Pick a subscription first.'}
          result={services}
          toOption={(svc) => ({
            value: svc.id,
            label: svc.location ? `${svc.name} (${svc.location})` : svc.name,
          })}
          value={service?.id}
          onChange={(svc) => {
            selectionStore.getState().selectService(svc ? parseApimServiceId(svc.id) : undefined)
          }}
        />
        <Picker<ArmApi>
          id="pick-api"
          label="API"
          waitingFor={service ? undefined : 'Pick an APIM instance first.'}
          result={apis}
          toOption={(item) => ({ value: item.name, label: `${item.displayName} (/${item.path})` })}
          value={api?.name}
          onChange={(item) => {
            selectionStore.getState().selectApi(item)
          }}
        />
      </CardContent>
    </Card>
  )
}
