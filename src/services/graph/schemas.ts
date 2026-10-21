import { z } from 'zod'

/**
 * Zod schemas for the Graph responses the app reads, flattened into small typed records. Fields
 * Graph may return as `null` become `undefined`.
 */

const optionalString = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined)

const appRoleSchema = z
  .looseObject({
    id: z.string(),
    value: optionalString,
    displayName: optionalString,
    description: optionalString,
    allowedMemberTypes: z.array(z.string()),
    isEnabled: z.boolean(),
  })
  .transform(({ id, value, displayName, description, allowedMemberTypes, isEnabled }) => ({
    id,
    /** The string that appears in the token's `roles` claim and in `required-claims`. */
    value,
    displayName,
    description,
    allowedMemberTypes,
    isEnabled,
  }))

export type GraphAppRole = z.output<typeof appRoleSchema>

export const servicePrincipalSchema = z
  .looseObject({
    id: z.string(),
    appId: z.string(),
    displayName: optionalString,
    servicePrincipalType: optionalString,
    servicePrincipalNames: z.array(z.string()).nullish(),
    appRoles: z.array(appRoleSchema).nullish(),
  })
  .transform((sp) => ({
    id: sp.id,
    appId: sp.appId,
    displayName: sp.displayName,
    /** `Application`, `ManagedIdentity`, `Legacy` or `SocialIdp`. */
    servicePrincipalType: sp.servicePrincipalType,
    servicePrincipalNames: sp.servicePrincipalNames ?? [],
    appRoles: sp.appRoles ?? [],
  }))

export type GraphServicePrincipal = z.output<typeof servicePrincipalSchema>

export const appRoleAssignmentSchema = z
  .looseObject({
    id: z.string(),
    appRoleId: z.string(),
    principalId: z.string(),
    principalType: optionalString,
    principalDisplayName: optionalString,
    resourceId: z.string(),
    resourceDisplayName: optionalString,
  })
  .transform((assignment) => ({
    id: assignment.id,
    /** The all-zero GUID is "default access", not a specific role. */
    appRoleId: assignment.appRoleId,
    principalId: assignment.principalId,
    /** `User`, `Group` or `ServicePrincipal`. */
    principalType: assignment.principalType,
    principalDisplayName: assignment.principalDisplayName,
    resourceId: assignment.resourceId,
    resourceDisplayName: assignment.resourceDisplayName,
  }))

export type GraphAppRoleAssignment = z.output<typeof appRoleAssignmentSchema>

export const groupSchema = z
  .looseObject({
    id: z.string(),
    displayName: optionalString,
    description: optionalString,
    securityEnabled: z.boolean().nullish(),
    groupTypes: z.array(z.string()).nullish(),
  })
  .transform((group) => ({
    id: group.id,
    displayName: group.displayName,
    description: group.description,
    securityEnabled: group.securityEnabled ?? undefined,
    groupTypes: group.groupTypes ?? [],
  }))

export type GraphGroup = z.output<typeof groupSchema>

const GROUP_TYPE = '#microsoft.graph.group'

/**
 * One direct member of a group. Nested groups come back as `group` so the caller can drop them:
 * members of a nested group don't receive roles assigned to the parent.
 */
export const groupMemberSchema = z
  .looseObject({
    '@odata.type': z.string(),
    id: z.string(),
    displayName: optionalString,
    userPrincipalName: optionalString,
    appId: optionalString,
    servicePrincipalType: optionalString,
  })
  .transform((member) => {
    const base = { id: member.id, displayName: member.displayName }
    switch (member['@odata.type']) {
      case '#microsoft.graph.user':
        return { kind: 'user' as const, ...base, userPrincipalName: member.userPrincipalName }
      case '#microsoft.graph.servicePrincipal':
        return {
          kind: 'servicePrincipal' as const,
          ...base,
          appId: member.appId,
          servicePrincipalType: member.servicePrincipalType,
        }
      case GROUP_TYPE:
        return { kind: 'group' as const, ...base }
      default:
        return { kind: 'other' as const, ...base, odataType: member['@odata.type'] }
    }
  })

export type GraphGroupMember = z.output<typeof groupMemberSchema>
/** A member as the services return it: nested groups are already filtered out. */
export type GraphDirectMember = Exclude<GraphGroupMember, { kind: 'group' }>
