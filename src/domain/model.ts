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
