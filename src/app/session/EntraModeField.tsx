import { cn } from '@/lib/utils'
import { sessionStore, useSession } from './sessionStore'

const MODES = [
  {
    entra: false,
    title: 'ARM only',
    detail:
      'Only an ARM token. With a Reader account, Azure itself refuses any change. Shows operations, policies, backends and outbound auth; not who can call.',
  },
  {
    entra: true,
    title: 'ARM and Entra',
    detail:
      'Also a Graph token, to show who holds the roles and who is in the groups. A Graph token can do whatever your account can in Entra.',
  },
] as const

/** Whether Microsoft Graph (Entra) is used at all. In ARM-only mode no Graph request is made. */
export function EntraModeField() {
  const entra = useSession((state) => state.entra)
  return (
    <fieldset className="space-y-2">
      <legend className="text-base font-medium">Mode</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {MODES.map((mode) => (
          <label
            key={mode.title}
            className={cn(
              'hover:bg-accent flex cursor-pointer gap-2 rounded-md border p-3 text-sm',
              mode.entra === entra && 'border-primary',
            )}
          >
            <input
              type="radio"
              name="entra-mode"
              className="mt-1"
              checked={mode.entra === entra}
              onChange={() => {
                sessionStore.getState().setEntra(mode.entra)
              }}
            />
            <span>
              <span className="block font-medium">{mode.title}</span>
              <span className="text-muted-foreground block text-xs">{mode.detail}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
