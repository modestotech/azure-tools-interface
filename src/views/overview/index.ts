import { lazy } from 'react'

/**
 * The landing page's summary chart. Not a registered view: the shell shows it on the Overview.
 * Lazy, so ECharts loads only once an API is analyzed.
 */
export const OverviewCharts = lazy(() => import('./OverviewCharts'))
