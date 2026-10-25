import { Table } from 'lucide-react'
import { lazy } from 'react'
import type { ViewDefinition } from '../types'

export const operationsTableView: ViewDefinition = {
  id: 'operations-table',
  title: 'Operations',
  description: 'Every operation with its auth, callers, backend, outbound auth and findings.',
  icon: Table,
  component: lazy(() => import('./OperationsTable')),
}
