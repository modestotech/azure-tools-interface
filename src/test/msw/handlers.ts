import { http, HttpResponse } from 'msw'
import { APIM_API_VERSION } from '@/services/arm/apiVersion'

export const ARM = 'https://management.azure.com'
export const GRAPH = 'https://graph.microsoft.com/v1.0'

/** Fictional data only. Real ARM/Graph fixtures arrive with the services layer (M2). */
export const handlers = [
  http.get(`${ARM}/subscriptions/:sub/providers/Microsoft.ApiManagement/service`, ({ request }) => {
    const apiVersion = new URL(request.url).searchParams.get('api-version')
    if (apiVersion !== APIM_API_VERSION) {
      return HttpResponse.json({ error: { code: 'InvalidApiVersion' } }, { status: 400 })
    }
    return HttpResponse.json({ value: [] })
  }),
]
