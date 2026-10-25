import { accessGraphView } from './access-graph'
import { operationsTableView } from './operations-table'
import { principalExplorerView } from './principal-explorer'
import type { ViewDefinition } from './types'

/** Every view, in navigation order. */
export const views: readonly ViewDefinition[] = [
  operationsTableView,
  accessGraphView,
  principalExplorerView,
]
