import type { AccessModel } from '@/domain'

/** A table, rendered by the generic result component and exportable as CSV or JSON. */
export interface ScriptResult {
  readonly columns: readonly { readonly key: string; readonly title: string }[]
  readonly rows: readonly Readonly<Record<string, string | number | boolean | undefined>>[]
}

/**
 * A read-only analysis: a pure function over the domain model. Scripts filter and present
 * findings; they never re-implement the checks (CLAUDE.md › Guidelines).
 */
export interface ScriptDefinition<Params = Record<string, never>> {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly defaultParams: Params
  run(model: AccessModel, params: Params): ScriptResult
}
