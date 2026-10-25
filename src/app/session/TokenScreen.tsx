import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { clearSession } from './clearSession'
import { EntraModeField } from './EntraModeField'
import { SafetyNotice } from './SafetyNotice'
import { useSession } from './sessionStore'
import { TenantField } from './TenantField'
import { TokenField } from './TokenField'

/**
 * Where the user picks the mode and pastes the tokens. The notice comes first, before anything is
 * pasted. In ARM-only mode there is no Graph token field at all.
 */
export function TokenScreen() {
  const entra = useSession((state) => state.entra)
  return (
    <div className="space-y-4">
      <SafetyNotice />
      <Card>
        <CardHeader>
          <CardTitle>Tokens</CardTitle>
          <CardDescription>
            Run the az {entra ? 'commands' : 'command'} (after <code>az login</code>) and paste{' '}
            {entra
              ? 'each token. A token is only valid for one API, so both are needed.'
              : 'the token.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <EntraModeField />
          <TenantField />
          <TokenField api="arm" />
          {entra && <TokenField api="graph" />}
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
