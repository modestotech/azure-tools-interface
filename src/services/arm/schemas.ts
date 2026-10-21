import { z } from 'zod'

/**
 * Zod schemas for the ARM responses the app reads. Each one checks the fields it needs and flattens
 * the result into a small typed record; anything else in the response is ignored.
 */

const optionalString = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined)

export const subscriptionSchema = z
  .looseObject({
    subscriptionId: z.string(),
    displayName: z.string(),
    state: optionalString,
  })
  .transform(({ subscriptionId, displayName, state }) => ({ subscriptionId, displayName, state }))

export type ArmSubscription = z.output<typeof subscriptionSchema>

const userAssignedIdentitySchema = z.looseObject({
  clientId: z.string(),
  principalId: z.string(),
})

const identitySchema = z
  .looseObject({
    type: z.string(),
    principalId: optionalString,
    userAssignedIdentities: z.record(z.string(), userAssignedIdentitySchema).nullish(),
  })
  .transform(({ type, principalId, userAssignedIdentities }) => ({
    type,
    /** The system-assigned identity's object ID, if the service has one. */
    systemAssignedPrincipalId: principalId,
    /** User-assigned identities; `resourceId` is the key ARM uses for each. */
    userAssigned: Object.entries(userAssignedIdentities ?? {}).map(([resourceId, identity]) => ({
      resourceId,
      clientId: identity.clientId,
      principalId: identity.principalId,
    })),
  }))

export const apimServiceSchema = z
  .looseObject({
    id: z.string(),
    name: z.string(),
    location: optionalString,
    identity: identitySchema.nullish(),
  })
  .transform(({ id, name, location, identity }) => ({
    id,
    name,
    location,
    identity: identity ?? undefined,
  }))

export type ArmApimService = z.output<typeof apimServiceSchema>
export type ArmServiceIdentity = NonNullable<ArmApimService['identity']>

export const apiSchema = z
  .looseObject({
    id: z.string(),
    name: z.string(),
    properties: z.looseObject({
      displayName: z.string(),
      path: z.string(),
      serviceUrl: optionalString,
      apiRevision: optionalString,
      isCurrent: z.boolean().nullish(),
    }),
  })
  .transform(({ id, name, properties }) => ({
    id,
    name,
    displayName: properties.displayName,
    path: properties.path,
    /** The default backend when no policy sets one. */
    serviceUrl: properties.serviceUrl,
    apiRevision: properties.apiRevision,
    // ARM leaves isCurrent out on some APIs; only an explicit false marks an old revision.
    isCurrent: properties.isCurrent !== false,
  }))

export type ArmApi = z.output<typeof apiSchema>

export const operationSchema = z
  .looseObject({
    id: z.string(),
    name: z.string(),
    properties: z.looseObject({
      displayName: z.string(),
      method: z.string(),
      urlTemplate: z.string(),
    }),
  })
  .transform(({ id, name, properties }) => ({
    id,
    name,
    displayName: properties.displayName,
    method: properties.method,
    urlTemplate: properties.urlTemplate,
  }))

export type ArmOperation = z.output<typeof operationSchema>

/** A policy fetched with `format=rawxml`; only the XML is kept. */
export const policySchema = z
  .looseObject({ properties: z.looseObject({ value: z.string() }) })
  .transform(({ properties }) => properties.value)

const credentialsSchema = z
  .record(z.string(), z.unknown())
  .nullish()
  .transform((credentials) =>
    // Only which mechanisms are configured. Values can hold keys or secrets and are dropped here.
    Object.entries(credentials ?? {})
      .filter(([, value]) => isConfigured(value))
      .map(([mechanism]) => mechanism)
      .sort(),
  )

function isConfigured(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

export const backendSchema = z
  .looseObject({
    id: z.string(),
    name: z.string(),
    properties: z.looseObject({
      title: optionalString,
      description: optionalString,
      url: optionalString,
      protocol: optionalString,
      type: optionalString,
      resourceId: optionalString,
      tls: z
        .looseObject({
          validateCertificateChain: z.boolean().nullish(),
          validateCertificateName: z.boolean().nullish(),
        })
        .nullish(),
      credentials: credentialsSchema,
    }),
  })
  .transform(({ id, name, properties }) => ({
    id,
    name,
    title: properties.title,
    description: properties.description,
    url: properties.url,
    protocol: properties.protocol,
    /** `Single` unless ARM says otherwise (e.g. `Pool`, which is outside the supported pattern). */
    type: properties.type ?? 'Single',
    resourceId: properties.resourceId,
    tls: {
      validateCertificateChain: properties.tls?.validateCertificateChain ?? undefined,
      validateCertificateName: properties.tls?.validateCertificateName ?? undefined,
    },
    /** Names of the configured credential mechanisms (`authorization`, `header`, …), never values. */
    credentialMechanisms: properties.credentials,
  }))

export type ArmBackend = z.output<typeof backendSchema>
