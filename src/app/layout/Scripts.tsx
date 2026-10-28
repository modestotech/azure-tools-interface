import { useMemo, useState } from 'react'
import { ResultTable } from '@/components/ResultTable'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { AccessModel } from '@/domain'
import { cn } from '@/lib/utils'
import { scripts } from '@/scripts/registry'
import {
  defaultParams,
  type ScriptDefinition,
  type ScriptParam,
  type ScriptParams,
} from '@/scripts/types'
import { ArmOnlyNote } from '@/views/shared/ArmOnlyNote'
import { uiStore, useUi } from './uiStore'

/** Why `value` can't be used for `param`, or undefined if it can. */
function paramProblem(param: ScriptParam, value: number): string | undefined {
  if (!Number.isFinite(value)) return 'Enter a number.'
  if (param.min !== undefined && value < param.min)
    return `Enter a number of at least ${String(param.min)}.`
  return undefined
}

/**
 * A number input for one param. A cleared or invalid value isn't passed on: the field says what's
 * wrong and which value the result still uses.
 */
function ParamField({
  id,
  param,
  value,
  onChange,
}: {
  id: string
  param: ScriptParam
  value: number
  onChange: (value: number) => void
}) {
  const [problem, setProblem] = useState<string>()
  const errorId = `${id}-error`
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{param.label}</Label>
      <Input
        id={id}
        type="number"
        className="w-32"
        min={param.min}
        defaultValue={value}
        aria-invalid={problem !== undefined}
        aria-describedby={problem ? errorId : undefined}
        onChange={(event) => {
          const next = event.target.valueAsNumber
          const why = paramProblem(param, next)
          setProblem(why)
          if (!why) onChange(next)
        }}
      />
      {problem && (
        <p id={errorId} className="text-destructive text-xs">
          {problem} The result uses {value}.
        </p>
      )}
    </div>
  )
}

/** A number input per declared param. */
function ParamFields({
  script,
  params,
  onChange,
}: {
  script: ScriptDefinition
  params: ScriptParams
  onChange: (params: ScriptParams) => void
}) {
  if (script.params.length === 0) return null
  return (
    <div className="flex flex-wrap gap-4">
      {script.params.map((param) => (
        <ParamField
          key={param.key}
          id={`script-param-${script.id}-${param.key}`}
          param={param}
          value={params[param.key] ?? param.default}
          onChange={(value) => {
            onChange({ ...params, [param.key]: value })
          }}
        />
      ))}
    </div>
  )
}

/** The selected script, run on the model as it loads; pure, so it simply re-runs on each change. */
function ScriptRun({ script, model }: { script: ScriptDefinition; model: AccessModel }) {
  if (script.needsEntra && !model.entra) {
    return (
      <section aria-label={script.title} className="space-y-3">
        <div>
          <h2 className="font-medium">{script.title}</h2>
          <p className="text-muted-foreground text-sm">{script.description}</p>
        </div>
        <ArmOnlyNote>
          this script reads principals and groups from Entra, so it isn't run.
        </ArmOnlyNote>
      </section>
    )
  }
  return <ScriptResultView script={script} model={model} />
}

function ScriptResultView({ script, model }: { script: ScriptDefinition; model: AccessModel }) {
  const [params, setParams] = useState(() => defaultParams(script))
  const result = useMemo(() => script.run(model, params), [script, model, params])
  return (
    <section aria-label={script.title} className="space-y-3">
      <div>
        <h2 className="font-medium">{script.title}</h2>
        <p className="text-muted-foreground text-sm">{script.description}</p>
      </div>
      <ParamFields script={script} params={params} onChange={setParams} />
      {model.pending.length > 0 && (
        <p className="text-muted-foreground text-sm">
          Still loading; the result fills in as data arrives.
        </p>
      )}
      <ResultTable
        columns={result.columns}
        rows={result.rows}
        fileName={`${script.id}-${model.api.id}`}
        emptyText={model.pending.length > 0 ? 'Nothing found yet.' : 'Nothing found.'}
      />
    </section>
  )
}

/** The scripts from the registry: pick one, set its parameters, read or export the result. */
export function Scripts({ model }: { model: AccessModel }) {
  const activeId = useUi((state) => state.activeScriptId)
  const script = scripts.find((item) => item.id === activeId) ?? scripts[0]
  if (!script) return <p className="text-muted-foreground text-sm">No scripts are registered.</p>
  return (
    <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
      <nav aria-label="Scripts" className="flex flex-col gap-1">
        {scripts.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={item.id === script.id ? 'page' : undefined}
            className={cn(
              'hover:bg-accent rounded-md px-3 py-2 text-left text-sm',
              item.id === script.id && 'bg-accent font-medium',
            )}
            onClick={() => {
              uiStore.getState().openScript(item.id)
            }}
          >
            {item.title}
          </button>
        ))}
      </nav>
      {/* Keyed, so each script starts from its own default parameters. */}
      <ScriptRun key={script.id} script={script} model={model} />
    </div>
  )
}
