/**
 * Every TanStack Query key the app uses, built here so invalidation and "Clear session" can rely on
 * the prefixes (`['arm']`, `['graph']`). Keys hold IDs and names only, never tokens. The request
 * log shows them masked.
 *
 * `svc` is the APIM service's ARM resource ID, which already includes the subscription and
 * resource group.
 */
export const queryKeys = {
  /** Placeholder for a query that is skipped until its inputs exist. Never fetched. */
  waiting: ['waiting'] as const,
  arm: {
    all: ['arm'] as const,
    subscriptions: () => ['arm', 'subscriptions'] as const,
    services: (sub: string) => ['arm', sub, 'services'] as const,
    service: (sub: string, svc: string) => ['arm', sub, svc] as const,
    apis: (sub: string, svc: string) => ['arm', sub, svc, 'apis'] as const,
    globalPolicy: (sub: string, svc: string) => ['arm', sub, svc, 'policy'] as const,
    operations: (sub: string, svc: string, apiId: string) =>
      ['arm', sub, svc, 'apis', apiId, 'operations'] as const,
    apiPolicy: (sub: string, svc: string, apiId: string) =>
      ['arm', sub, svc, 'apis', apiId, 'policy'] as const,
    operationPolicy: (sub: string, svc: string, apiId: string, opId: string) =>
      ['arm', sub, svc, 'apis', apiId, 'operations', opId, 'policy'] as const,
    backend: (sub: string, svc: string, backendId: string) =>
      ['arm', sub, svc, 'backends', backendId] as const,
    resource: (resourceId: string) => ['arm', 'resource', resourceId] as const,
  },
  graph: {
    all: ['graph'] as const,
    spByAppId: (appId: string) => ['graph', 'sp', appId] as const,
    spById: (id: string) => ['graph', 'sp', 'id', id] as const,
    spByName: (servicePrincipalName: string) =>
      ['graph', 'sp', 'name', servicePrincipalName] as const,
    /** Service principals for a `validate-jwt` audience or managed identity `resource` (a list). */
    spsForAudience: (audience: string) => ['graph', 'sp', 'audience', audience] as const,
    /** A `$batch` lookup; the IDs are sorted so the same set always gives the same key. */
    spsByIds: (ids: readonly string[]) => ['graph', 'sp', 'ids', ...[...ids].sort()] as const,
    appRoleAssignedTo: (spId: string) => ['graph', 'sp', 'id', spId, 'appRoleAssignedTo'] as const,
    appRoleAssignments: (spId: string) =>
      ['graph', 'sp', 'id', spId, 'appRoleAssignments'] as const,
    group: (groupId: string) => ['graph', 'group', groupId] as const,
    groupMembers: (groupId: string) => ['graph', 'group', groupId, 'members'] as const,
  },
} as const
