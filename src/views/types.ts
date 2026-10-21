import type { LucideIcon } from 'lucide-react'
import type { ComponentType, LazyExoticComponent } from 'react'
import type { AccessModel } from '@/domain'

export interface ViewProps {
  /** The selected API's model. It fills in while loading; check `model.pending`. */
  readonly model: AccessModel
}

/** A visualization. Add one to `views/registry.ts`; navigation and the landing page follow. */
export interface ViewDefinition {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly icon: LucideIcon
  /** Lazy-loaded (`React.lazy`), because views pull in heavy libraries (React Flow, elkjs, ECharts). */
  readonly component: LazyExoticComponent<ComponentType<ViewProps>>
}
