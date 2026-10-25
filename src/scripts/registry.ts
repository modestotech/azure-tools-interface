import { backendIssuesScript } from './starter/backendIssues'
import { broadAccessScript } from './starter/broadAccess'
import { ineffectiveMembersScript } from './starter/ineffectiveMembers'
import { noAuthScript } from './starter/noAuth'
import { unresolvedRulesScript } from './starter/unresolvedRules'
import type { ScriptDefinition } from './types'

/** Every script, in display order. */
export const scripts: readonly ScriptDefinition[] = [
  noAuthScript,
  broadAccessScript,
  ineffectiveMembersScript,
  backendIssuesScript,
  unresolvedRulesScript,
]
