import { Network } from 'lucide-react'
import { lazy } from 'react'
import type { ViewDefinition } from '../types'

export const accessGraphView: ViewDefinition = {
  id: 'access-graph',
  title: 'Access graph',
  description: 'Who can call each operation, through which group, and where the call goes.',
  icon: Network,
  component: lazy(() => import('./AccessGraph')),
}
