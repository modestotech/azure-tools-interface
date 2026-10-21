import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { clearSession } from './clearSession'
import { SafetyNotice } from './SafetyNotice'
import { TenantField } from './TenantField'
import { TokenField } from './TokenField'

/** Where the user pastes the two tokens. The notice comes first, before anything is pasted. */
export function TokenScreen() {
  return (
    <div className="space-y-4">
      <SafetyNotice />
      <Card>
        <CardHeader>
          <CardTitle>Tokens</CardTitle>
          <CardDescription>
            Run the two az commands (after <code>az login</code>) and paste each token. A token is
            only valid for one API, so both are needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <TenantField />
          <TokenField api="arm" />
          <TokenField api="graph" />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              clearSession()
            }}
          >
            <Trash2 /> Clear session
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
