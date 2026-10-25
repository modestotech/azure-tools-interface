import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import type { Severity } from '@/domain'

const VARIANT = { high: 'destructive', medium: 'secondary', info: 'outline' } as const

export function SeverityBadge({ severity, children }: { severity: Severity; children: ReactNode }) {
  return <Badge variant={VARIANT[severity]}>{children}</Badge>
}
