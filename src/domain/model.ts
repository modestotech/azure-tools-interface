/**
 * The normalized domain model. Views and scripts depend on these types, so keep them stable
 * (CLAUDE.md › Domain model). Nothing here is shaped by a particular view or library.
 */

// APIM

export interface UserAssignedIdentity {
  readonly resourceId: string
  readonly clientId: string
  readonly principalId: string
}

export interface ApimService {
  /** ARM resource ID. */
  readonly id: string
  readonly name: string
  readonly userAssignedIdentities: readonly UserAssignedIdentity[]
}

export interface Api {
  /** The API's ARM name (`apiId`). */
  readonly id: string
  readonly displayName: string
  readonly path: string
  /** The default backend when no policy sets one. */
  readonly serviceUrl: string | undefined
}

export interface Operation {
  /** The operation's ARM name (`opId`). */
  readonly id: string
  readonly displayName: string
  readonly method: string
  readonly urlTemplate: string
}

// Policies

export type PolicyScope = 'global' | 'api' | 'operation'
export type PolicySection = 'inbound' | 'backend' | 'outbound' | 'on-error'
/** Only these sections affect access and routing; `outbound` and `on-error` are not analyzed. */
export type AnalyzedSection = Extract<PolicySection, 'inbound' | 'backend'>

export const POLICY_SECTIONS: readonly PolicySection[] = [
  'inbound',
  'backend',
  'outbound',
  'on-error',
]
export const ANALYZED_SECTIONS: readonly AnalyzedSection[] = ['inbound', 'backend']

/** An XML element from a policy document, comments removed, children in document order. */
export interface XmlElement {
  readonly name: string
  readonly attributes: Readonly<Record<string, string>>
  readonly children: readonly XmlNode[]
}

export interface XmlText {
  readonly text: string
}

export type XmlNode = XmlElement | XmlText

export interface PolicyDocument {
  readonly scope: PolicyScope
  /** Set for operation-scope documents. */
  readonly operationId?: string | undefined
  readonly xml: string
  /** The document's sections, or why it couldn't be read. */
  readonly parsed:
    | { readonly ok: true; readonly sections: Readonly<Partial<Record<PolicySection, XmlElement>>> }
    | { readonly ok: false; readonly error: string }
}

/** Where a rule comes from, so the UI can show it. */
export interface RuleSource {
  readonly scope: PolicyScope
  readonly section: AnalyzedSection
}

export interface RequiredClaim {
  readonly name: string
  /** `any`: holding one listed value is enough. `all` is APIM's default. */
  readonly match: 'any' | 'all'
  readonly values: readonly string[]
}

/** `<validate-jwt>`: who may call. */
export interface JwtValidationRule {
  readonly kind: 'validate-jwt'
  readonly source: RuleSource
  /** Header the token is read from; `Authorization` in the target pattern. */
  readonly headerName: string | undefined
  readonly openIdConfigUrls: readonly string[]
  readonly audiences: readonly string[]
  readonly issuers: readonly string[]
  readonly requiredClaims: readonly RequiredClaim[]
}

/** `<set-backend-service backend-id="…"/>`: where the call goes. */
export interface BackendRule {
  readonly kind: 'set-backend-service'
  readonly source: RuleSource
  readonly backendId: string
}

/** `<authentication-managed-identity resource="…" client-id="…"/>`: how APIM authenticates outbound. */
export interface ManagedIdentityAuthRule {
  readonly kind: 'authentication-managed-identity'
  readonly source: RuleSource
  readonly resource: string
  /** A user-assigned identity's client ID; undefined means the system-assigned identity. */
  readonly clientId: string | undefined
}

export type AccessRule = JwtValidationRule | BackendRule | ManagedIdentityAuthRule

/** Anything in `inbound` / `backend` outside the supported pattern. Shown as "needs manual review". */
export interface UnresolvedRule {
  readonly source: RuleSource
  /** Element name, e.g. `choose`. */
  readonly element: string
  /** The element as XML, for the UI. */
  readonly xml: string
  readonly reason: string
}

/** A section at some scope that has no `<base />`, so everything above it is dropped. */
export interface DroppedParent {
  readonly section: AnalyzedSection
  readonly scope: PolicyScope
}

/** The effective policy of one operation, after `<base />` composition: global → API → operation. */
export interface OperationPolicy {
  readonly operationId: string
  /** In document order, so the last `set-backend-service` in `inbound` is the one that wins. */
  readonly rules: readonly AccessRule[]
  readonly unresolved: readonly UnresolvedRule[]
  /** Sections that dropped their parent ("parent inbound ignored" when the section is `inbound`). */
  readonly droppedParents: readonly DroppedParent[]
}

// Entra

export interface AppRole {
  readonly id: string
  /** The string in the token's `roles` claim; undefined for a role without a value. */
  readonly value: string | undefined
  readonly displayName: string | undefined
  readonly isEnabled: boolean
}

export interface ServicePrincipal {
  readonly kind: 'servicePrincipal'
  readonly id: string
  /** Undefined until the service principal's details have loaded. */
  readonly appId: string | undefined
  readonly displayName: string | undefined
}

export interface ManagedIdentity {
  readonly kind: 'managedIdentity'
  readonly id: string
  readonly appId: string | undefined
  readonly displayName: string | undefined
}

export interface User {
  readonly kind: 'user'
  readonly id: string
  readonly displayName: string | undefined
  /** Known when the user was found as a group member; app role assignments don't include it. */
  readonly userPrincipalName: string | undefined
}

export interface Group {
  readonly kind: 'group'
  readonly id: string
  readonly displayName: string | undefined
}

/** A directory object that isn't a user, app or group (e.g. a device). It can't call an API. */
export interface OtherPrincipal {
  readonly kind: 'other'
  readonly id: string
  readonly displayName: string | undefined
}

export type Principal = ServicePrincipal | ManagedIdentity | User | Group | OtherPrincipal

// Backends and outbound auth

export interface Backend {
  /** `backend:{backendId}` for a backend entity, `service-url` for the API's serviceUrl. */
  readonly key: string
  readonly backendId: string | undefined
  readonly title: string | undefined
  readonly url: string | undefined
  readonly protocol: string | undefined
  /** `Single` (the pattern), `Pool`, or `ApiServiceUrl` when no policy sets a backend. */
  readonly type: string
  readonly tls: {
    readonly validateCertificateChain: boolean | undefined
    readonly validateCertificateName: boolean | undefined
  }
  /** Which credential mechanisms the backend entity configures, never their values. */
  readonly credentialMechanisms: readonly string[]
}

export interface BackendBinding {
  readonly operationId: string
  readonly backendKey: string
  /** The `set-backend-service` rule that chose it; undefined when the API's serviceUrl applies. */
  readonly source: RuleSource | undefined
}

export type OutboundAuth =
  | { readonly mechanism: 'None' }
  | {
      readonly mechanism: 'ManagedIdentity'
      readonly source: RuleSource
      /** Undefined for the system-assigned identity. */
      readonly clientId: string | undefined
      /** The identity's service principal object ID, once known. */
      readonly principalId: string | undefined
      /** The token audience APIM requests (`resource`). */
      readonly resource: string
      /** Service principals that `resource` resolves to. */
      readonly targetIds: readonly string[]
      /** App roles the identity holds on those service principals. */
      readonly roles: readonly AppRole[]
    }

// The access graph: principal / group member → operation → backend

export type AccessEdge =
  /** A role holder (user, app, managed identity or group) whose roles meet the operation's requirement. */
  | {
      readonly kind: 'grant'
      readonly principalId: string
      readonly operationId: string
      /** The required role values this principal holds. */
      readonly roles: readonly string[]
    }
  /**
   * A direct member of a group that holds a grant. Only users get the group's roles; an app or
   * managed identity calling with its own identity doesn't, so its membership is not effective.
   */
  | {
      readonly kind: 'membership'
      readonly groupId: string
      readonly memberId: string
      readonly effective: boolean
      readonly reason: string | undefined
    }
  | { readonly kind: 'route'; readonly operationId: string; readonly backendKey: string }
