import { Users } from 'lucide-react'
import { lazy } from 'react'
import type { ViewDefinition } from '../types'

export const principalExplorerView: ViewDefinition = {
  id: 'principal-explorer',
  title: 'Principals',
  description: 'Pick an app, user or group and see which operations it can call, and why.',
  icon: Users,
  component: lazy(() => import('./PrincipalExplorer')),
}
