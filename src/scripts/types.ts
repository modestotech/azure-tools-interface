import type { AccessModel } from '@/domain'

export type ScriptValue = string | number | boolean | undefined

/** A table, rendered by the generic result component and exportable as CSV or JSON. */
export interface ScriptResult {
  readonly columns: readonly { readonly key: string; readonly title: string }[]
  readonly rows: readonly Readonly<Record<string, ScriptValue>>[]
}

/** A number the user can set before running a script, e.g. the N in "more than N operations". */
export interface ScriptParam {
  readonly key: string
  readonly label: string
  readonly default: number
  readonly min?: number
}

export type ScriptParams = Readonly<Record<string, number>>

/**
 * A read-only analysis: a pure function over the domain model. Scripts filter and present
 * findings; they never re-implement the checks (CLAUDE.md › Guidelines).
 */
export interface ScriptDefinition {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly params: readonly ScriptParam[]
  /** Gets every declared param, set or defaulted. Runs on a partial model while it loads. */
  run(model: AccessModel, params: ScriptParams): ScriptResult
}

/** The declared params with their defaults. */
export function defaultParams(script: ScriptDefinition): ScriptParams {
  return Object.fromEntries(script.params.map((param) => [param.key, param.default]))
}
