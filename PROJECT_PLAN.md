# PROJECT_PLAN — APIM ↔ Entra access mapper

> Nothing gets committed until you OK it (per CLAUDE.md › Git).

## Context

The repo has nothing in it yet except `CLAUDE.md`. That file is the spec for a static, backend-less React SPA. You paste an ARM token and a Graph token, and the app maps every APIM operation to:
- the policies that protect it,
- the Entra principals that can call it, and
- the backend it routes to, including how APIM authenticates outbound.

While data loads, a developer-facing "Matrix-style" request log streams the live ARM/Graph traffic. I have no Azure access, so I build everything against fixtures and MSW. Real anonymized samples from you are the input that most affects quality (see §6).

## 1. Spec issues to resolve first (small CLAUDE.md edits, with your OK)

1. **Line 10** says "who is in that group (*transitive* membership)". Lines 143 and 208 say *direct members only, no nesting*. I'll follow direct-only and fix line 10.
2. **Line 210**: the concurrency bullet ("Policy fetches can be numerous…") is glued onto the end of the previous bullet. It needs a newline.
3. **"Never write sub/tenant IDs to logs"** vs. the request log, which shows URLs that contain the subscription ID. Proposal: the log masks the sub and tenant IDs as `{sub}` / `{tid}` by default, with an in-memory "reveal" toggle. Tokens are never shown.

## 2. Milestones (each one ends green on `pnpm typecheck && pnpm lint && pnpm test`)

**M0 — Scaffold**
- Vite + React + TS strict, pnpm, Tailwind + shadcn/ui, ESLint + Prettier, Vitest + Testing Library, MSW (browser and node).
- Scripts exactly as listed in CLAUDE.md.
- SPA fallback: `public/staticwebapp.config.json` with `navigationFallback`. For Storage static websites, document setting the 404 document to `index.html`.
- Look up and pin the latest GA `Microsoft.ApiManagement` api-version in `src/services/arm/apiVersion.ts` (currently expected to be `2024-05-01`; I'll verify online).

**M1 — `lib/` foundations**
- `lib/token`: JWT decode (`aud`, `tid`, `upn`/`oid`, `exp`) plus checks for audience, tenant and expiry. Unit-tested.
- `lib/http`: a `request()` wrapper with:
  - the auth header, and an `aud` guard before each request batch
  - GET-only enforcement; the only exception is POST to `https://graph.microsoft.com/v1.0/$batch`, and only when every sub-request is a GET
  - paging (`nextLink` / `@odata.nextLink`)
  - 429 `Retry-After` handling
  - a concurrency limiter (8 in flight)
  - typed errors (`Unauthorized` carries the az command to copy, plus `Forbidden` and `NotFound`)
  - token redaction in every error message
- `lib/http/requestLog`: an in-memory event bus (Zustand slice, ring buffer of about 2,000 entries).
  - Each entry: id, method, masked URL, status, duration, bytes, retry count, query key, and pending/ok/error state.
  - The wrapper emits on start and on finish, so the log covers every call with no per-call wiring.
- `app/session` store: tokens, sub ID and tenant ID, held in memory only. A unit test asserts nothing reaches `localStorage` or `sessionStorage`.

**M2 — `services/` (raw layer, Zod-validated)**
- `services/arm`: services (including `identity`), APIs (including `serviceUrl`), operations, products, product→API links, policies at 4 scopes (`format=rawxml`, where 404 means "no policy"), policy fragments, named values (secret values never read), backends, and an optional `GET {resourceId}` that tolerates 403/404.
- `services/graph`:
  - service principal lookups: by appId, by id, by `servicePrincipalNames` filter
  - `appRoles`, `appRoleAssignedTo` and `appRoleAssignments`
  - groups and their *direct* members, with group-type members filtered out
  - a `$batch` helper that chunks requests into groups of 20
- Each call gets a TanStack Query hook with stable keys (`['arm', sub, svc, 'apis']`, `['graph','sp',appId]`, …).
- Errors are kept per resource; nothing fails globally.

**M3 — `domain/` (pure TS; this is the bulk of the tests)**
- `model.ts`: the types listed in CLAUDE.md, as discriminated unions.
- `policy-parser/`:
  - fast-xml-parser configured to *preserve order* (needed for `<base/>` placement and "last `set-backend-service` wins")
  - fragment expansion
  - named-value resolution (secret / Key Vault values become a reference name)
  - effective-policy composition: global → product → API → operation
  - extractors for `validate-azure-ad-token`, `validate-jwt` and `check-header`
  - backend and outbound-auth extractors, plus `send-request` / `forward-request`
  - `UnresolvedRule` for `@(...)`, `<choose>` and anything unrecognised; `conditional: true` for candidate backends
- `mapper/`: joins rules with Entra data into `AccessEdge[]`.
  - roles → appRoles → `appRoleAssignedTo` → principals → direct group members
  - SP/MI members of groups are marked `effective: false` with a reason
  - findings: no auth, no outbound auth, HTTP backend, unused backend entity, URL with no backend entity
- `useAccessModel()`: orchestrates the queries and builds the model incrementally, so views render partial data with progress.

**M4 — App shell and session screen**
- Token paste screen:
  - two token fields, plus sub ID and tenant ID
  - decoded claim cards with warnings
  - copyable `az` commands (prefilled with the tenant ID)
  - expiry countdown
- Scope picker: APIM instance, then an optional single API.
- Layout: nav and landing page generated from the registries; the request log is docked as a collapsible bottom or side panel.

**M5 — Matrix request log (`components/request-log/`)**
- Monospace green-on-black stream that auto-scrolls; you can pause it by scrolling up. Virtualized (`@tanstack/react-virtual`).
- Line format: `GET 200 143ms 4.2kB arm …/service/{svc}/apis`. Pending lines flicker; errors render red, and 404-as-empty renders dim.
- Header counters: in flight / done / errors / retries; progress bar for policy fetches.
- Filters by source (ARM/Graph) and status.
- Exports the log as JSON with masked URLs. Respects `prefers-reduced-motion`.

**M6 — Views (`views/registry.ts`)**
- `operations-table`: TanStack Table (virtualized) showing:
  - auth summary, source scope, backend and outbound auth
  - "needs manual review" badges
  - CSV/JSON export
- `access-graph`: React Flow + elkjs, layered left to right: principal / member → operation → backend → resource. Node details show rules and outbound auth; ineffective edges are greyed out; group members lazy-load.
- `principal-explorer`: pick a principal and see the operations it can reach, and why.
- `backends`: backend entities and ad-hoc URLs, pool members, circuit breaker, TLS, the credential *mechanism* only, the resolved resource, and APIM MI permissions.
- One small ECharts summary on the landing page (auth coverage, findings by type).

**M7 — Scripts (`scripts/registry.ts`) and a generic result renderer**
Starter scripts:
- operations with no auth
- principals with access to >N operations
- groups granting access via ineffective SP/MI members
- HTTP / no-outbound-auth backends
- unresolved rules

**M8 — Hardening**
- CORS check against real ARM/Graph (you run this, see §6). Add a Vite proxy only if needed, and document it in CLAUDE.md › Known gotchas.
- Large-tenant performance pass. README.

## 3. Key design decisions

- **Request log is a side effect of `lib/http`**. Views and services never log manually, so new views get logging for free.
- **Ordered XML parsing.** fast-xml-parser's `preserveOrder: true` is required for correctness around `<base/>`. I'll wrap it in a small typed tree helper so extractors don't handle raw arrays.
- **Read-only guard at runtime and in tests.** A test asserts the wrapper throws on any non-GET (except the validated `$batch`).
- **MSW serves both tests and `pnpm dev`** (a "demo mode" with fictional fixture data), so the app can be developed and demoed without a token.

## 4. Critical files (to create)

`src/lib/http/request.ts`, `src/lib/http/requestLog.ts`, `src/lib/token/jwt.ts`, `src/services/arm/*.ts`, `src/services/graph/*.ts`, `src/domain/model.ts`, `src/domain/policy-parser/{compose,extract,backend,resolve}.ts`, `src/domain/mapper/buildAccessModel.ts`, `src/views/registry.ts`, `src/scripts/registry.ts`, `src/components/request-log/RequestLog.tsx`, `src/test/fixtures/**`, `src/test/msw/handlers.ts`.

## 5. Verification

- `pnpm typecheck && pnpm lint && pnpm test` at every milestone.
- Parser and mapper fixture tests cover:
  - inheritance with and without `<base/>`
  - fragments and named values
  - choose/expressions producing unresolved and conditional results
  - every outbound auth mechanism
  - group members that are SP/MI vs. users
- `pnpm dev` in MSW demo mode: the full flow renders and the log streams.
- `pnpm build`, then `pnpm preview`: deep links work through the fallback.
- **Live smoke test, run by you**: paste real tokens against a test APIM and report anything wrong. I never see the tokens.

## 6. What I need from you (anonymized, never committed raw)

Public docs cover the response *shapes* well, so I start from doc-based fixtures. Real samples matter most for **policy XML variety**, so that's where I'd ask for help.

**Priority A — policy XML (biggest unknown)**
- 5–15 real policies across scopes: global, product, API, operation.
- Ideally include: `validate-azure-ad-token`, `validate-jwt` with `roles`/`scp` claims, `include-fragment`, `{{named values}}`, `choose`, `set-backend-service` (backend-id and base-url), `authentication-managed-identity`, `send-request`.
- Plus 1–2 policy fragments.
- Capture with: `az rest --method get --url "https://management.azure.com/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.ApiManagement/service/<svc>/apis/<api>/policies/policy?format=rawxml&api-version=2024-05-01"`

**Priority B — one ARM JSON sample each** (anonymize GUIDs, hostnames, names):
- service list (with `identity`)
- `backends` (one Single, one Pool, one with `credentials`)
- `namedValues` (one secret, one Key Vault)
- `apis` (with `serviceUrl`)

**Priority C — one Graph JSON sample each**:
- an API service principal with `appRoles`
- its `appRoleAssignedTo` (mixing user, group and SP)
- `/groups/{id}/members` (mixing user, SP and group)
- capture with `az rest --resource https://graph.microsoft.com --url ...`

**Priority D — browser checks** (later, at M8):
- From the dev server, confirm whether ARM, Graph and Graph `$batch` calls pass CORS with a pasted token.
- One real 401 and one real 403 response body.

**Anonymizing**: replace GUIDs with `00000000-0000-0000-0000-00000000000N`, tenant and company names with `contoso`, and hosts with `*.example.net`. Keep the structure and attribute names untouched.
