import { PRINCIPAL_KIND_LABEL, principalLabel } from '@/domain'
import { operationLookup } from '../operations'
import type { ScriptDefinition } from '../types'

/**
 * Apps and managed identities placed in a group that holds the API's roles. Group roles only
 * reach users, so these get nothing from the group: usually a misconfiguration.
 */
export const ineffectiveMembersScript: ScriptDefinition = {
  id: 'ineffective-members',
  title: 'Groups granting access via ineffective app members',
  description:
    "Apps and managed identities in a role-holding group. Group roles don't reach them, so they can't call through it.",
  params: [],
  run(model) {
    const operations = operationLookup(model)
    const rows = model.findings.flatMap((finding) => {
      if (finding.kind !== 'ineffective-member') return []
      const group = model.principals.get(finding.groupId)
      const member = model.principals.get(finding.memberId)
      const granted = model.edges.flatMap((edge) =>
        edge.kind === 'grant' && edge.principalId === finding.groupId ? [edge.operationId] : [],
      )
      return [
        {
          group: group ? principalLabel(group) : finding.groupId,
          member: member ? principalLabel(member) : finding.memberId,
          memberType: member ? PRINCIPAL_KIND_LABEL[member.kind] : undefined,
          memberId: finding.memberId,
          groupGrants: operations.list(granted),
        },
      ]
    })
    return {
      columns: [
        { key: 'group', title: 'Group' },
        { key: 'member', title: 'Member' },
        { key: 'memberType', title: 'Member type' },
        { key: 'groupGrants', title: 'The group grants' },
        { key: 'memberId', title: 'Member object ID' },
      ],
      rows,
    }
  },
}
