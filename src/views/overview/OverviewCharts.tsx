import { BarChart } from 'echarts/charts'
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'
import ReactEChartsCore from 'echarts-for-react/esm/core'
import { useMemo } from 'react'
import type { Severity } from '@/domain'
import type { ViewProps } from '../types'
import {
  AUTH_COVERAGE_LABEL,
  authCoverage,
  findingsByKind,
  type AuthCoverage,
  type CoverageCount,
  type FindingCount,
} from './summary'

echarts.use([
  BarChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  AriaComponent,
  CanvasRenderer,
])

/*
 * Colors: status colors carry state (and always come with a text label); text stays in ink
 * tokens. Hex, because the canvas can't read the app's CSS variables.
 *
 * Tooltips use `renderMode: 'richText'` (drawn on the canvas): the default HTML tooltip writes
 * inline `style` attributes through innerHTML, which the CSP (`style-src 'self'`) blocks.
 */
const STATUS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' }
const NEUTRAL = { light: '#8a8983', dark: '#6b6a65' }
const INK = {
  light: { primary: '#0b0b0b', secondary: '#52514e', grid: '#e4e3df' },
  dark: { primary: '#f0efec', secondary: '#c3c2b7', grid: '#383835' },
}

const COVERAGE_COLOR: Readonly<Record<AuthCoverage, string | undefined>> = {
  roles: STATUS.good,
  'token-only': STATUS.warning,
  none: STATUS.critical,
  // Unknown, not good or bad: neutral like loading, told apart by its label.
  unreadable: undefined,
  loading: undefined,
}
const SEVERITY_COLOR: Readonly<Record<Severity, string>> = {
  high: STATUS.critical,
  medium: STATUS.serious,
  info: '#3987e5',
}

type Mode = 'light' | 'dark'
const themeMode = (): Mode =>
  document.documentElement.classList.contains('dark') ? 'dark' : 'light'

const TOOLTIP = { renderMode: 'richText', confine: true } as const

/** One 100% bar: every operation, split by how it's protected. */
function coverageOption(counts: readonly CoverageCount[], mode: Mode): EChartsOption {
  const ink = INK[mode]
  return {
    aria: { enabled: true },
    tooltip: { ...TOOLTIP, trigger: 'item' },
    legend: { top: 0, left: 0, textStyle: { color: ink.secondary }, itemWidth: 12, itemHeight: 12 },
    grid: { top: 32, bottom: 0, left: 0, right: 0, containLabel: false },
    xAxis: { type: 'value', show: false, max: 'dataMax' },
    yAxis: { type: 'category', show: false, data: ['operations'] },
    series: counts.map(({ coverage, operations }) => ({
      type: 'bar',
      name: AUTH_COVERAGE_LABEL[coverage],
      stack: 'operations',
      barWidth: 24,
      data: [operations],
      // A 2px surface gap between segments.
      itemStyle: {
        color: COVERAGE_COLOR[coverage] ?? NEUTRAL[mode],
        borderColor: mode === 'dark' ? '#1a1a19' : '#fcfcfb',
        borderWidth: 1,
      },
      label: { show: true, color: '#0b0b0b', formatter: String(operations) },
    })),
  }
}

/** Findings per kind, one bar each, colored by severity and labeled with the count. */
function findingsOption(counts: readonly FindingCount[], mode: Mode): EChartsOption {
  const ink = INK[mode]
  const rows = [...counts].reverse() // ECharts draws categories bottom-up.
  return {
    aria: { enabled: true },
    tooltip: { ...TOOLTIP, trigger: 'item' },
    grid: { top: 0, bottom: 0, left: 0, right: 32, containLabel: true },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: rows.map((item) => `${item.kind} (${item.severity})`),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: ink.secondary },
    },
    series: [
      {
        type: 'bar',
        name: 'Findings',
        barWidth: 12,
        data: rows.map((item) => ({
          value: item.count,
          name: item.title,
          itemStyle: { color: SEVERITY_COLOR[item.severity], borderRadius: [0, 4, 4, 0] },
        })),
        label: { show: true, position: 'right', color: ink.primary },
      },
    ],
  }
}

/** The same numbers as text, so nothing depends on reading the chart. */
function SummaryTable({
  coverage,
  findings,
}: {
  coverage: readonly CoverageCount[]
  findings: readonly FindingCount[]
}) {
  return (
    <details className="text-sm">
      <summary className="text-muted-foreground cursor-pointer">Show as table</summary>
      <table className="mt-2 w-full text-left">
        <tbody>
          {coverage.map((item) => (
            <tr key={item.coverage} className="border-t">
              <td className="py-1 pr-3">{AUTH_COVERAGE_LABEL[item.coverage]}</td>
              <td className="py-1">{item.operations} operations</td>
            </tr>
          ))}
          {findings.map((item) => (
            <tr key={item.kind} className="border-t">
              <td className="py-1 pr-3">
                {item.title} ({item.severity})
              </td>
              <td className="py-1">{item.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

/** The landing page summary: auth coverage and findings by kind. */
export default function OverviewCharts({ model }: ViewProps) {
  const coverage = useMemo(() => authCoverage(model), [model])
  const findings = useMemo(() => findingsByKind(model), [model])
  const mode = themeMode()
  if (model.operations.length === 0) return null
  return (
    <section aria-label="Summary" className="space-y-3 rounded-md border p-4">
      <h2 className="text-sm font-medium">Auth coverage · {model.operations.length} operations</h2>
      <ReactEChartsCore
        echarts={echarts}
        option={coverageOption(coverage, mode)}
        style={{ height: 64 }}
        notMerge
      />
      <h2 className="text-sm font-medium">Findings by kind · {model.findings.length}</h2>
      {findings.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {model.pending.length > 0 ? 'Loading…' : 'No findings.'}
        </p>
      ) : (
        <ReactEChartsCore
          echarts={echarts}
          option={findingsOption(findings, mode)}
          style={{ height: Math.max(48, findings.length * 28) }}
          notMerge
        />
      )}
      <SummaryTable coverage={coverage} findings={findings} />
    </section>
  )
}
