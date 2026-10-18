import { http, HttpResponse } from 'msw'
import { API_RESOURCES } from '@/lib/token'
import { APIM_API_VERSION } from '@/services/arm/apiVersion'

export const ARM = API_RESOURCES.arm.baseUrl
export const GRAPH = API_RESOURCES.graph.baseUrl

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
