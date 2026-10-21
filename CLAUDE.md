# CLAUDE.md

## Project overview

A client-side SPA that maps **Azure API Management (APIM) policies** to **Microsoft Entra ID identities**. Given two access tokens (ARM and Graph) and a tenant, the user picks a subscription, an APIM instance and **exactly one API**. For that API it answers:

- Which operations the API has, and which policies protect them
- Which service principals (apps / managed identities) are allowed to call each operation
- Who those service principals are (display name, appId, owners, type)
- If access is granted through a group, who is in that group (direct members only — nested groups are not expanded)
- Which backend each operation routes to: backend type and URL, and how APIM authenticates to it (including APIM's own managed identity and what it has access to). Backends are identified by URL only; the Azure resource behind a backend is not looked up

**One API at a time.** The analysis always runs against a single selected API, never the whole APIM instance. The only instance-wide calls are the ones needed to fill the pickers (list subscriptions, APIM services, API names), plus the service itself (for its `identity`) and the global policy. Don't add an "all APIs" option.

**Pattern:** the app targets one company's APIM pattern, not every possible APIM setup. `PROJECT_PLAN.md` §1 describes it, and the reference policy is `samples-raw/api-policy.xml` (an anonymized copy will live in `src/test/fixtures/`). Anything outside the pattern is flagged for manual review, not supported.

The results are shown as interactive visualizations (graph + tables). More visualizations and "scripts" (read-only analyses) will be added later, so the architecture must make adding new ones cheap.

The interface should be focused on developers, and should be showing the requests being made in a Matrix style log. This should happen while the requests to construct the visualizations are being made.

There is **no backend**. The browser calls Azure Resource Manager and Microsoft Graph directly.

## Development restrictions

### Azure access

You will not get access to any token while developing this. The samples needed from me are listed in `PROJECT_PLAN.md` §6; ask for more if something can't be found online.

Raw samples go in `samples-raw/` (gitignored except its README). Read them from there and write anonymized copies to `src/test/fixtures/`. Never copy raw samples anywhere else in the repo.

### Git

Don't commit any code before consulting me. Commit messages: a short title, then a body explaining why and what. One commit per logical change.

### Documentation

`CLAUDE.md` holds the rules and conventions. `PROJECT_PLAN.md` holds milestones and status. `README.md` is the short intro. `TECH_DEBT_PLAN_M1.md` records the M1 refactor. When a rule changes, update `CLAUDE.md` and refer to it rather than repeating it elsewhere.

## Authentication model

There is no app registration and no MSAL login. The user runs `az login` and pastes tokens into the UI.

**Two tokens are required**, because a token is only valid for one audience:

```bash
# ARM token — used for APIM
az account get-access-token --resource https://management.azure.com --tenant <TENANT_ID> --query accessToken -o tsv

# Graph token — used for Entra
az account get-access-token --resource https://graph.microsoft.com --tenant <TENANT_ID> --query accessToken -o tsv
```

Rules:
- Tokens, the selected subscription ID and tenant ID are held **in memory only** (React state / store). Never write them to `localStorage`, `sessionStorage`, cookies, URLs, logs or error messages.
- The on-screen request log shows URLs with the subscription ID and tenant ID masked as `{sub}` / `{tid}` by default. An in-memory "reveal" toggle may unmask them. Tokens are never shown, and log exports are always masked.
- Log exports go through an allowlist (`EXPORTED_FIELDS` in `lib/http/requestLog.ts`). A new log field is exported only if it's added there on purpose. Azure's free-text error messages are never exported (they can hold UPNs, object IDs and resource names); export the error `kind` and `status` instead.
- Tenant and subscription IDs are validated before they're stored: a subscription ID must be a GUID, a tenant ID a GUID or a domain name. Nothing unvalidated goes into a URL or an `az` command.
- Anything that holds session data (query cache, stores, view state) registers with `onClearSession()` (`app/session/clearSession.ts`), so "Clear session" wipes it.
- Decode the JWT (no validation needed) to show `aud`, `tid`, `upn`/`oid` and `exp`. Warn if `aud` doesn't match the expected resource, if `tid` doesn't match the entered tenant, or if the token expires soon (they typically last ~60–90 min).
- The HTTP client refuses to send when the token is missing (`no-token`), can't be decoded (`invalid-token`), is for the wrong audience (`audience-mismatch`), or has expired (`token-expired`, with the az command). A tenant mismatch or a token about to expire is only a warning on the token screen.
- On 401, surface a clear "token expired or wrong audience — re-run az command" message with the exact command to copy (`HttpError.azCommand`).
- The app is strictly **read-only**: only `GET` requests (plus Graph `$batch`, which wraps GETs). Never add calls that modify Azure or Entra.

Required permissions for the signed-in user: `Reader` (or `API Management Service Reader Role`) on the APIM instance; directory read access in Entra (the default Azure CLI Graph token works for reading service principals, groups and members in most tenants).

## Tech stack

- **Vite + React + TypeScript** (strict mode)
- **TanStack Query** for fetching, caching, retries and pagination
- **Zustand** for app state (session/tokens, selections, filters)
- **React Flow (@xyflow/react)** + **elkjs** for the access graph (see `AccessEdge` below)
- **Apache ECharts** (via `echarts-for-react`) for charts/summaries
- **TanStack Table** for tabular views and exports (CSV/JSON)
- **Tailwind CSS** + **shadcn/ui** for UI components
- **fast-xml-parser** for APIM policy XML, with **fast-xml-validator** to reject malformed XML (fast-xml-parser's own validator is deprecated)
- **Zod** for validating API responses at the boundary
- **Vitest** + **Testing Library** for tests; **MSW** to mock ARM/Graph in tests and local dev
- Package manager: **pnpm**

Deployment target: static hosting (Azure Static Web Apps or Storage static website). `pnpm build` must produce a fully static `dist/` with client-side routing fallback.

## Commands

```bash
pnpm install
pnpm dev          # local dev server
pnpm dev:demo     # dev server with MSW serving fictional ARM/Graph data (no token needed)
pnpm build        # type-check + production build
pnpm test         # unit tests
pnpm lint         # eslint + prettier check
pnpm format       # prettier --write
pnpm typecheck    # tsc -b (all tsconfigs have noEmit)
```

Tooling notes:
- pnpm comes from Corepack (`corepack enable pnpm`). It's pinned in `package.json` › `packageManager` to pnpm 11, because Corepack 0.34 can't run pnpm 12.
- `pnpm-workspace.yaml` sets `minimumReleaseAge` to 14 days, so new versions are only installed once they have been public that long.
- TypeScript stays on 6.0.x until `typescript-eslint` supports 7.
- MSW stays on 2.x for now. `public/mockServiceWorker.js` is generated by `pnpm exec msw init public --no-save`; regenerate it after upgrading MSW.

Run `pnpm typecheck && pnpm lint && pnpm test` before considering a task done.

## Architecture

```
src/
  app/                 # shell, routing, layout, session/token input screen
    session/           # sessionStore.ts, httpClient.ts (the app's client), queryClient.ts, clearSession.ts
    AppProviders.tsx   # provides the query cache and the HTTP client (HttpClientContext) to the hooks
  lib/
    http/              # HTTP client: auth header, guards, paging, retries, request log
      client.ts        #   createHttpClient (getJson, getJsonOrNull, getAllPages, batch, reset)
      retry.ts         #   429/503 rules, Retry-After, backoff
      odata.ts         #   odataString / withQuery for Graph query strings
      mask.ts          #   {sub} / {tid} / {token} masking
      requestLog.ts    #   in-memory log store behind the Matrix log
      errors.ts        #   HttpError (discriminated by `kind`) and factories
    token/             # JWT decode, audience/tenant/expiry checks, API endpoints (resources.ts)
  services/
    queryKeys.ts       # every TanStack Query key
    query.ts           # HttpClientContext, useHttpClient, resourceQuery (shared by the hooks)
    result.ts          # ResourceResult (ok / empty / forbidden / error), settle()
    arm/               # APIM ARM calls (raw API layer, typed + Zod-validated); apiVersion.ts,
                       #   urls.ts (ApimServiceRef from the service resource ID, armUrls)
    graph/             # Microsoft Graph calls (raw API layer)
  domain/
    model.ts           # normalized domain types (see below)
    policy-parser/     # APIM policy XML → access rules
      xmlTree.ts       #   typed tree over fast-xml-parser's ordered output (parseXml, toXml, child helpers)
      compose.ts       #   composeSection: <base /> composition, one function for all sections
      elements.ts      #   the element table (supported / ignored / unresolved) and the extractors
      analyze.ts       #   analyzeOperationPolicy: effective inbound/backend rules of one operation
    findings.ts        # every Finding kind with its severity (FINDING_INFO)
    mapper/            # joins APIM rules with Entra objects into the access graph
      buildAccessModel.ts  # pure: AccessModelInputs (each part may still be loading) → AccessModel
      inbound.ts / outbound.ts  # who may call; where it goes and how APIM authenticates
      lookups.ts       #   what to fetch next (policyLookups, modelLookups), for useAccessModel()
    useAccessModel.ts  # the hook views use: chains the query hooks through the lookups, builds the model
  views/               # one folder per visualization, registered in views/registry.ts
    access-graph/
    operations-table/
    principal-explorer/
    backends/
  scripts/             # read-only analyses, registered in scripts/registry.ts
  components/          # shared UI
  test/                # fixtures (sample policy XML, ARM/Graph JSON) and MSW handlers
tests/
  security/            # Node-side guards: source scan for network/storage use, production-build checks
```

Layering is one-way: `views` / `scripts` → `domain` → `services` → `lib`. Views never call fetch directly and never parse raw ARM/Graph shapes; they consume the normalized domain model. ESLint enforces the `lib` / `services` / `domain` boundaries (`LAYERS` in `eslint.config.js`; tests are exempt).

Services take an `HttpClient` as a parameter and never import from `app/`. The single instance lives in `app/session/httpClient.ts` and is passed in by the app shell; tests pass their own.

Module-level state in `lib/` is limited to `requestLogStore` (`lib/http/requestLog.ts`) and the mask cache (`lib/http/mask.ts`). `clearSession()` wipes both explicitly. Any other app-wide instance lives in `app/` and registers with `onClearSession()`.

Guidelines from `TECH_DEBT_PLAN_M1.md`:
- **Policy parser** (built): extractors read the typed tree in `xmlTree.ts`, never fast-xml-parser's raw arrays. Element handling lives only in the `ELEMENTS` table in `elements.ts`. `<base />` composition goes through `composeSection()` for every section.
- **Findings:** computed once in `domain/` (no auth, HTTP backend, no outbound auth, unresolved rules, …). Scripts filter or present them and never re-implement the checks. Keep `buildAccessModel()` pure and separate from the fetching in `useAccessModel()`. Views get the model from `useAccessModel(svc, api)`; nothing is fetched, not even the service's identity or global policy, until an API is chosen.
- **Views:** registry entries are lazy-loaded (`React.lazy`), because React Flow, elkjs and ECharts are heavy. The CSP is defined once and used for both the `<meta>` tag and `staticwebapp.config.json`.

### Extensibility (views and scripts)

New visualizations and analyses plug in through registries, not by editing the app shell.

- A **view** exports `{ id, title, description, icon, component }` and is added to `views/registry.ts`. It receives the domain model via hooks (e.g. `useAccessModel()`).
- A **script** exports `{ id, title, description, run(model, params) => ScriptResult }` and is added to `scripts/registry.ts`. Scripts are pure functions over the domain model (e.g. "operations with no auth policy", "principals with access to >N operations", "groups granting access with external members"). Results render through a generic table/JSON output component.
- Navigation and the landing page are generated from the registries.

## Data sources

### APIM (ARM, `https://management.azure.com`)

Base URLs come only from `API_RESOURCES[api].baseUrl` (`lib/token/resources.ts`). Every ARM api-version lives in `services/arm/apiVersion.ts` (`APIM_API_VERSION`, `SUBSCRIPTIONS_API_VERSION`). Never hard-code hosts or versions elsewhere, tests included. Resources to fetch:

- Subscriptions the user can access (for the picker): `/subscriptions?api-version=2022-12-01` (Microsoft.Resources, not the APIM api-version)
- APIM services in the subscription (for the picker): `/subscriptions/{sub}/providers/Microsoft.ApiManagement/service`
- APIs (for the picker; names and `serviceUrl` only, no per-API calls): `.../service/{svc}/apis`
- Everything below is fetched for the **selected API** only.
- Operations: `.../apis/{apiId}/operations`
- Policies (all `?format=rawxml`):
  - Global: `.../service/{svc}/policies/policy`
  - API: `.../apis/{apiId}/policies/policy`
  - Operation: `.../apis/{apiId}/operations/{opId}/policies/policy`
- Backends referenced by the API's policies, one by one: `.../service/{svc}/backends/{backendId}` — `title`, `description`, `url`, `protocol`, `type` (expected `Single`), `tls` settings, and `credentials` (record only *which* auth mechanism is configured, never values)
- The API's `serviceUrl` property, which is the default backend when no policy overrides it
- The APIM service's `identity`, especially `userAssignedIdentities` (`clientId` → `principalId`), for outbound managed-identity auth
- **Backends are URL only.** A backend's `resourceId` (e.g. a Container App) is not fetched: no `GET {resourceId}` and no per-provider api-versions. Don't add one without a decision to widen the scope.

A 404 on a policy endpoint means "no policy at that scope". Fetch those with `getJsonOrNull`, which returns `null` and logs the request as `empty`. Don't catch the 404 by hand.

### Entra (Microsoft Graph, `https://graph.microsoft.com/v1.0`)

- The API's service principal, found from the `validate-jwt` audience: a GUID audience → `/servicePrincipals(appId='{appId}')`; an `api://…` or other URI → `/servicePrincipals?$filter=servicePrincipalNames/any(x:x eq '{audience}')`
- Its app roles: `appRoles` on that service principal
- Who holds app roles on the API: `/servicePrincipals/{id}/appRoleAssignedTo`
- Group details and direct members only: `/groups/{id}`, `/groups/{id}/members`. Do not fetch `transitiveMembers` and do not expand nested groups — members of nested groups don't receive app roles assigned to the parent group.
- APIM's user-assigned managed identity as a service principal: `/servicePrincipals/{principalId}` and its outbound permissions via `/servicePrincipals/{principalId}/appRoleAssignments`
- Target of `authentication-managed-identity`: resolve the `resource` audience to a service principal with `/servicePrincipals?$filter=servicePrincipalNames/any(x:x eq '{resource}')`
- Values in `$filter` come from policy XML. Always build them with `odataString()` and `withQuery()` from `lib/http/odata.ts`, never by string interpolation.
- The same goes for IDs in URL paths, ARM and Graph alike (`sub`, `svc`, `apiId`, `opId`, `backendId`, Graph `id`): build them with `encodePathSegment()` from `lib/http/odata.ts`, which rejects `..`, `/`, `?` and `#`.
- Use `$select` to keep payloads small, `$batch` (max 20 requests per batch) for bulk lookups, follow `@odata.nextLink`, and honor `Retry-After` on 429.

## Policy parsing rules

The parser turns effective policy XML into `AccessRule`s. Key behaviors:

- Compute the **effective policy per operation and per section** (`inbound`, `backend`, `outbound`, `on-error`) by applying `<base />` inheritance: global → API → operation. A section without `<base />` drops the parent's section. Record that, and flag it as "parent inbound ignored" when it happens in `inbound` (the reference policy does this). Each rule keeps its source scope so the UI can show where it came from.
- Supported elements (the target pattern):
  - `<validate-jwt>`: `<openid-config>`, `<issuers>`, `<audiences>`, `<required-claims>` with `roles` (`match="any"` or `"all"`)
  - `<set-backend-service backend-id="..."/>`
  - `<authentication-managed-identity resource="..." client-id="..."/>`
- Map constraints to Entra:
  - Audience → the API's service principal
  - Required `roles` values → app roles on it → `appRoleAssignedTo` → service principals, users and groups → direct group members
  - A required role that doesn't exist in the API's `appRoles` is a finding
- Classify every element in `inbound` and `backend`:
  - **Supported** → a rule.
  - **Response-only** (`set-header` other than `Authorization`, `rate-limit*`, `quota*`, `cors`, `<base />`) → ignored. So is `<forward-request />`: it sends the call to the backend chosen elsewhere and is in nearly every global `backend` section.
  - **Anything else** → an `UnresolvedRule` with the raw XML snippet, shown in the UI as "needs manual review". This includes `<choose>`, `<include-fragment>`, `{{named values}}`, `validate-azure-ad-token`, `send-request`, `set-backend-service base-url` and `@(...)` expressions in access or routing attributes. Never silently drop it or guess.
- `outbound` and `on-error` don't affect access or routing and are not analyzed. Their `@(...)` expressions must not produce `UnresolvedRule`s.
- Operations with no authentication policy at any scope are flagged explicitly.

### Backend resolution

- `<set-backend-service backend-id="..."/>` → link to the backend entity. If more than one runs, the last one in `inbound` wins.
- No `set-backend-service` at any scope → the API's `serviceUrl`.

Outbound authentication:

- `<authentication-managed-identity resource="..." client-id="..."/>`:
  1. Match `client-id` to the APIM service's `identity.userAssignedIdentities[*].clientId` to get its `principalId`.
  2. Resolve `resource` to the target service principal.
  3. Show the app roles that identity holds on the target, from `appRoleAssignments` filtered to the target.
- Flag these as findings: backends with no outbound auth, HTTP (non-TLS) URLs, and an APIM identity that holds no role on the target.

## Domain model (normalized)

Core types live in `domain/model.ts`. Keep them stable — views and scripts depend on them.

- `ApimService`, `Api`, `Operation`
- `PolicyDocument` (scope, raw XML, parsed tree)
- `AccessRule` (operation, source scope, kind, constraint values) and `UnresolvedRule`
- `Principal` — discriminated union: `ServicePrincipal` | `User` | `Group` | `ManagedIdentity` | `OtherPrincipal` (a non-user, non-app member such as a device; it can't call)
- `AppRole`, `AppRoleAssignment`, `GroupMembership`
- `Backend` — `id`, `title`, `url`, `protocol`, `type` (`Single` | `ApiServiceUrl`)
- `BackendBinding` — operation → backend, source scope
- `OutboundAuth` — mechanism (`ManagedIdentity` | `None`), identity used (user-assigned `clientId` / `principalId`), target audience / service principal, app roles held
- `AccessEdge` — the graph edge set the visualizations render (`principal/group member → operation → backend`, with rules and outbound auth as edge/node details): `grant` (role holder → operation), `membership` (group → direct member, with `effective`), `route` (operation → backend)
- `AccessModel` (`domain/mapper`) — operations with their effective policy, backend binding and outbound auth, plus principals, backends, edges, findings, load problems and what's still pending. A finding is only raised from loaded data, never while an input is still loading.

## Conventions

- TypeScript strict, no `any`; validate external responses with Zod in `services/` by passing the schema to the client (`getJson(api, url, { schema })`, likewise `getJsonOrNull` and `getAllPages` with the item schema). Don't `parse` the result afterwards: the client logs a mismatch as `error`, while a later parse would leave the request logged as `ok`.
- Functional React components and hooks; keep components presentational and logic in hooks/domain.
- All data loading through TanStack Query. All query keys come from `services/queryKeys.ts`; never write key arrays inline. Each service call has a hook (`services/arm/queries.ts`, `services/graph/queries.ts`) built with `resourceQuery()`: inputs may be `undefined`, and the query stays idle (`skipToken`) until they're chosen. Query data is a `ResourceResult`. Hooks over a list of IDs (`useOperationPolicies`, `useBackends`, `useAppRoleAssignedTo`, …) use `useResourceQueries()` and return a `Map` from ID to result that only changes when a result does, so it can be a memo dependency. The cache never refetches on its own and doesn't retry (the HTTP client does), so the request log shows only requests the user caused.
- Large tenants: virtualize long lists/tables, lazy-load group members. The one-API scope (see Project overview) keeps request volume bounded.
- Errors are shown per resource, not as a global failure — a forbidden Graph call should not block the APIM view. Services return per-resource outcomes as `ResourceResult` (`settle()` in `services/result.ts`). `settle` takes a function (`settle(() => client.getJson(…))`), so an error thrown while building the URL settles as that resource's `error` too.
- Tell HTTP errors apart by `kind` (`isHttpError(e, 'forbidden')`), never with `instanceof`.
- The request log must match what the caller sees. If a response fails validation (Zod, paging or `$batch` shape), its log entry finishes as `error`, never `ok`, and the thrown `HttpError` carries the masked `url` and the `status`. Inside a `$batch`, each sub-response is its own result (`subResponseResult` in `services/graph/batch.ts`): a non-2xx sub-response is counted on the POST's log line (`· N failed`), and a sub-response body of the wrong shape is that item's `invalid-response`, while the POST itself stays `ok`.
- Every outbound request has a timeout and honors its `AbortSignal`, including while it waits in the limiter queue. The timeout (`requestTimeoutMs`, default 30 s) applies per attempt, from leaving the queue until the body is read, and fails as kind `timeout`; a caller abort is logged as `cancelled`.
- Keep functions to one job. Pure decisions (classifying responses, partitioning `$batch` results, choosing a retry delay) live in small named functions next to the I/O code, not inline in loops.
- Name things after what they hold, not after the raw field they come from: a derived value doesn't reuse a JWT claim name (`aud`, `upn`), and an error kind says what went wrong (no catch-all `'http'`).
- Unit-test the policy parser and mapper heavily using real-world-shaped XML fixtures in `src/test/fixtures/`. No live Azure calls in tests.
- `tests/security/` must stay green: `noLeaks.test.ts` fails on network calls outside `lib/http/client.ts` and on any browser persistence; `build.test.ts` builds the production site and fails on a shipped service worker, external resources in `index.html`, or a URL origin not on its allowlist. Add an origin to `ALLOWED_ORIGINS` only with a reason, and never weaken these tests to make a change pass.
- `public/mockServiceWorker.js` is for `pnpm dev:demo` only; a Vite plugin removes it from every other build.
- Tests run in two Vitest projects: `dom` (jsdom) for `.tsx` tests and `src/app/`, `node` for everything else. Put new tests that need browser APIs under `src/app/` or in a `.tsx` file.
- `src/test/setup.ts` calls `clearSession()` after every test. In tests, use `ARM` / `GRAPH` from `test/msw/handlers.ts` and `APIM_API_VERSION` instead of literal URLs and versions. Test helpers (e.g. `fakeJwt.ts`) take audiences from `API_RESOURCES[api].resource`. The exceptions are tests that check those constants or the origin allowlist themselves (`checks.test.ts`, `odata.test.ts`, `tests/security/`).
- Never commit real tokens, tenant IDs, subscription IDs, policy XML or exports from a real tenant. Fixtures must be anonymized.

## Known gotchas

- Calling ARM and Graph from the browser relies on their CORS support. If a call is blocked by CORS during development, use a Vite dev-server proxy rather than adding a backend, and document it here.
- An ARM token cannot call Graph and vice versa. The HTTP client checks `aud` before every request; don't bypass it.
- When an app role is assigned to a group, list the group's **direct members only**. Filter out any member that is itself a group (`@odata.type` `#microsoft.graph.group`) — nested groups are not shown at all.
  - **User member** → effective: the role appears in the user's token.
  - **Service principal / managed identity member** → *not* effective: an app calling with its own identity only gets roles assigned directly to its service principal; group membership gives it nothing. Show it greyed out with a short explanation rather than hiding it, since it's usually a misconfiguration.
- Policy fetches can be numerous (one per operation). Limit concurrency (e.g. 8 in flight) and show progress.
- Because only one API is analyzed, "unused backend" can't be determined. Don't list all backends or report unused ones.
- The `__X__` placeholders in the reference policy are filled in at deploy time, so the live policies contain literal values. If a live policy still contains a `{{named value}}`, treat it as unresolved.