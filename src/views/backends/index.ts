import { Server } from 'lucide-react'
import { lazy } from 'react'
import type { ViewDefinition } from '../types'

export const backendsView: ViewDefinition = {
  id: 'backends',
  title: 'Backends',
  description: 'Where each operation goes: URL, TLS, credentials, and the roles APIM holds there.',
  icon: Server,
  component: lazy(() => import('./Backends')),
}
