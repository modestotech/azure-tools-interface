import type { PolicyScope, UnresolvedRule } from './model'

/**
 * Every finding the app reports, computed once by the mapper. Scripts and views filter and present
 * these; they never re-implement the checks (CLAUDE.md › Guidelines).
 */
export type Finding =
  | { readonly kind: 'no-auth'; readonly operationId: string }
  | {
      readonly kind: 'parent-inbound-ignored'
      readonly operationId: string
      readonly scope: PolicyScope
    }
  | {
      readonly kind: 'unresolved-rule'
      readonly operationId: string
      readonly rule: UnresolvedRule
    }
  | { readonly kind: 'no-audience'; readonly operationId: string }
  | { readonly kind: 'audience-not-found'; readonly operationId: string; readonly audience: string }
  | { readonly kind: 'no-role-requirement'; readonly operationId: string }
  | { readonly kind: 'unknown-role'; readonly operationId: string; readonly role: string }
  | { readonly kind: 'unsupported-claim'; readonly operationId: string; readonly claim: string }
  | { readonly kind: 'ineffective-member'; readonly groupId: string; readonly memberId: string }
  | { readonly kind: 'backend-not-found'; readonly operationId: string; readonly backendId: string }
  | { readonly kind: 'no-backend-url'; readonly operationId: string; readonly backendKey: string }
  | { readonly kind: 'http-backend'; readonly operationId: string; readonly backendKey: string }
  | { readonly kind: 'no-outbound-auth'; readonly operationId: string }
  | { readonly kind: 'identity-not-found'; readonly operationId: string; readonly clientId: string }
  | { readonly kind: 'resource-not-found'; readonly operationId: string; readonly resource: string }
  | {
      readonly kind: 'identity-has-no-role'
      readonly operationId: string
      readonly resource: string
    }

export type FindingKind = Finding['kind']
export type Severity = 'high' | 'medium' | 'info'

/** Severity and a short title per kind, for the UI and for scripts. */
export const FINDING_INFO: Readonly<Record<FindingKind, { severity: Severity; title: string }>> = {
  'no-auth': { severity: 'high', title: 'No validate-jwt at any scope: anyone can call' },
  'parent-inbound-ignored': {
    severity: 'info',
    title: 'Inbound has no <base />: global and product inbound policies are ignored',
  },
  'unresolved-rule': {
    severity: 'medium',
    title: 'Needs manual review: outside the supported pattern',
  },
  'no-audience': {
    severity: 'high',
    title: 'validate-jwt checks no audience: a token issued for any app is accepted',
  },
  'audience-not-found': {
    severity: 'high',
    title: 'No service principal matches the token audience',
  },
  'no-role-requirement': {
    severity: 'high',
    title: 'No roles claim required: any app or user that gets a token can call',
  },
  'unknown-role': {
    severity: 'medium',
    title: "A required role doesn't exist on the API's app roles",
  },
  'unsupported-claim': {
    severity: 'medium',
    title: 'Requires a claim other than roles; check it manually',
  },
  'ineffective-member': {
    severity: 'medium',
    title: "App or managed identity in a group: group roles don't apply to it",
  },
  'backend-not-found': {
    severity: 'medium',
    title: 'set-backend-service names a backend that does not exist',
  },
  'no-backend-url': { severity: 'medium', title: 'The backend has no URL' },
  'http-backend': { severity: 'high', title: 'Backend URL is plain HTTP (no TLS)' },
  'no-outbound-auth': { severity: 'medium', title: 'APIM sends no credentials to the backend' },
  'identity-not-found': {
    severity: 'high',
    title: "client-id doesn't match any of the APIM service's user-assigned identities",
  },
  'resource-not-found': {
    severity: 'medium',
    title: 'No service principal matches the managed identity resource',
  },
  'identity-has-no-role': {
    severity: 'high',
    title: "APIM's identity holds no app role on the backend's service principal",
  },
}
