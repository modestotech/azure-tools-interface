import type { ReactNode } from 'react'

/** Says what a view leaves out in ARM-only mode, where Entra data isn't looked up. */
export function ArmOnlyNote({ children }: { children: ReactNode }) {
  return (
    <p role="note" className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
      ARM-only mode: {children} To include it, choose "ARM and Entra" under Session and scope.
    </p>
  )
}
