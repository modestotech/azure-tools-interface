# CLAUDE.md

## Project overview

A client-side SPA that maps **Azure API Management (APIM) policies** to **Microsoft Entra ID identities**. Given two access tokens (ARM and Graph), a subscription and a tenant, it answers:

- Which APIs and operations exist in an APIM instance, and which policies protect them
- Which service principals (apps / managed identities) are allowed to call each operation
- Who those service principals are (display name, appId, owners, type)
- If access is granted through a group, who is in that group (direct members only — nested groups are not expanded)
- Which backend each operation routes to: backend type, URL, the Azure resource behind it, and how APIM authenticates to it (including APIM's own managed identity and what it has access to)

**Scope:** the app targets one company's APIM pattern, not every possible APIM setup. `PROJECT_PLAN.md` §1 describes it, and the reference policy is `samples-raw/api-policy.xml` (an anonymized copy will live in `src/test/fixtures/`). Anything outside the pattern is flagged for manual review, not supported.

The results are shown as interactive visualizations (graph + tables). More visualizations and "scripts" (read-only analyses) will be added later, so the architecture must make adding new ones cheap.

The interface should be focused on developers, and should be showing the requests being made in a Matrix style log. This should happen while the requests to construct the visualizations are being made.

There is **no backend**. The browser calls Azure Resource Manager and Microsoft Graph directly.

## Development restrictions

### Azure access

You will not get access to any token while developing this. The samples needed from me are listed in `PROJECT_PLAN.md` §6; ask for more if something can't be found online.

Raw samples go in `samples-raw/` (gitignored except its README). Read them from there and write anonymized copies to `src/test/fixtures/`. Never copy raw samples anywhere else in the repo.

### Git

Don't commit any code before consulting me.

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
- Tokens, subscription ID and tenant ID are held **in memory only** (React state / store). Never write them to `localStorage`, `sessionStorage`, cookies, URLs, logs or error messages.
- The on-screen request log shows URLs with the subscription ID and tenant ID masked as `{sub}` / `{tid}` by default. An in-memory "reveal" toggle may unmask them. Tokens are never shown, and log exports are always masked.
- Decode the JWT (no validation needed) to show `aud`, `tid`, `upn`/`oid` and `exp`. Warn if `aud` doesn't match the expected resource, if `tid` doesn't match the entered tenant, or if the token expires soon (they typically last ~60–90 min).
- On 401, surface a clear "token expired or wrong audience — re-run az command" message with the exact command to copy.
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
- **fast-xml-parser** for APIM policy XML
- **Zod** for validating API responses at the boundary
- **Vitest** + **Testing Library** for tests; **MSW** to mock ARM/Graph in tests and local dev
- Package manager: **pnpm**

Deployment target: static hosting (Azure Static Web Apps or Storage static website). `pnpm build` must produce a fully static `dist/` with client-side routing fallback.

## Commands

```bash
pnpm install
pnpm dev          # local dev server
pnpm build        # type-check + production build
pnpm test         # unit tests
pnpm lint         # eslint + prettier check
pnpm typecheck    # tsc --noEmit
```

Run `pnpm typecheck && pnpm lint && pnpm test` before considering a task done.

## Architecture

```
src/
  app/                 # shell, routing, layout, session/token input screen
  lib/
    http/              # fetch wrapper: auth header, paging (nextLink / @odata.nextLink), 429 retry-after, errors
    token/             # JWT decode, audience/tenant/expiry checks
  services/
    arm/               # APIM ARM calls (raw API layer, typed + Zod-validated)
    graph/             # Microsoft Graph calls (raw API layer)
  domain/
    model.ts           # normalized domain types (see below)
    policy-parser/     # APIM policy XML → access rules
    mapper/            # joins APIM rules with Entra objects into the access graph
  views/               # one folder per visualization, registered in views/registry.ts
    access-graph/
    operations-table/
    principal-explorer/
    backends/
  scripts/             # read-only analyses, registered in scripts/registry.ts
  components/          # shared UI
  test/                # fixtures (sample policy XML, ARM/Graph JSON) and MSW handlers
```

Layering is one-way: `views` / `scripts` → `domain` → `services` → `lib`. Views never call fetch directly and never parse raw ARM/Graph shapes; they consume the normalized domain model.

### Extensibility (views and scripts)

New visualizations and analyses plug in through registries, not by editing the app shell.

- A **view** exports `{ id, title, description, icon, component }` and is added to `views/registry.ts`. It receives the domain model via hooks (e.g. `useAccessModel()`).
- A **script** exports `{ id, title, description, run(model, params) => ScriptResult }` and is added to `scripts/registry.ts`. Scripts are pure functions over the domain model (e.g. "operations with no auth policy", "principals with access to >N operations", "groups granting access with external members"). Results render through a generic table/JSON output component.
- Navigation and the landing page are generated from the registries.

## Data sources

### APIM (ARM, `https://management.azure.com`)

Pin a GA `api-version` for `Microsoft.ApiManagement` in one constant (verify the latest GA version when setting it up). Resources to fetch:

- APIM services in the subscription: `/subscriptions/{sub}/providers/Microsoft.ApiManagement/service`
- APIs: `.../service/{svc}/apis`
- Operations: `.../apis/{apiId}/operations`
- Policies (all `?format=rawxml`):
  - Global: `.../service/{svc}/policies/policy`
  - API: `.../apis/{apiId}/policies/policy`
  - Operation: `.../apis/{apiId}/operations/{opId}/policies/policy`
- Backends: `.../service/{svc}/backends` — `title`, `description`, `url`, `protocol`, `type` (expected `Single`), `resourceId` (the Azure resource behind it, e.g. App Service, Function App, Container App), `tls` settings, and `credentials` (record only *which* auth mechanism is configured, never values)
- The API's `serviceUrl` property, which is the default backend when no policy overrides it
- The APIM service's `identity`, especially `userAssignedIdentities` (`clientId` → `principalId`), for outbound managed-identity auth
- Optionally, `GET {resourceId}` (with the matching provider `api-version`) to show the backend resource's kind, location and hostname; tolerate 403/404 since the user may lack access

A 404 on a policy endpoint means "no policy at that scope" — not an error.

### Entra (Microsoft Graph, `https://graph.microsoft.com/v1.0`)

- The API's service principal, found from the `validate-jwt` audience: a GUID audience → `/servicePrincipals(appId='{appId}')`; an `api://…` or other URI → `/servicePrincipals?$filter=servicePrincipalNames/any(x:x eq '{audience}')`
- Its app roles: `appRoles` on that service principal
- Who holds app roles on the API: `/servicePrincipals/{id}/appRoleAssignedTo`
- Group details and direct members only: `/groups/{id}`, `/groups/{id}/members`. Do not fetch `transitiveMembers` and do not expand nested groups — members of nested groups don't receive app roles assigned to the parent group.
- APIM's user-assigned managed identity as a service principal: `/servicePrincipals/{principalId}` and its outbound permissions via `/servicePrincipals/{principalId}/appRoleAssignments`
- Target of `authentication-managed-identity`: resolve the `resource` audience to a service principal with `/servicePrincipals?$filter=servicePrincipalNames/any(x:x eq '{resource}')`
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
  - **Response-only** (`set-header` other than `Authorization`, `rate-limit*`, `quota*`, `cors`, `<base />`) → ignored.
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
- `Principal` — discriminated union: `ServicePrincipal` | `User` | `Group` | `ManagedIdentity`
- `AppRole`, `AppRoleAssignment`, `GroupMembership`
- `Backend` — `id`, `title`, `url`, `protocol`, `type` (`Single` | `ApiServiceUrl`), `resourceId`, resolved resource info
- `BackendBinding` — operation → backend, source scope
- `OutboundAuth` — mechanism (`ManagedIdentity` | `None`), identity used (user-assigned `clientId` / `principalId`), target audience / service principal, app roles held
- `AccessEdge` — the graph edge set the visualizations render (`principal/group member → operation → backend → backend resource`, with rules and outbound auth as edge/node details)

## Conventions

- TypeScript strict, no `any`; validate external responses with Zod in `services/`.
- Functional React components and hooks; keep components presentational and logic in hooks/domain.
- All data loading through TanStack Query with stable query keys (`['arm', sub, svc, 'apis']`, `['graph', 'sp', appId]`, ...).
- Large tenants: virtualize long lists/tables, lazy-load group members, and let the user scope the analysis to one APIM instance or one API.
- Errors are shown per resource, not as a global failure — a forbidden Graph call should not block the APIM view.
- Unit-test the policy parser and mapper heavily using real-world-shaped XML fixtures in `src/test/fixtures/`. No live Azure calls in tests.
- Never commit real tokens, tenant IDs, subscription IDs, policy XML or exports from a real tenant. Fixtures must be anonymized.

## Known gotchas

- Calling ARM and Graph from the browser relies on their CORS support. If a call is blocked by CORS during development, use a Vite dev-server proxy rather than adding a backend, and document it here.
- An ARM token cannot call Graph and vice versa — check `aud` before every request batch.
- When an app role is assigned to a group, list the group's **direct members only**. Filter out any member that is itself a group (`@odata.type` `#microsoft.graph.group`) — nested groups are not shown at all.
  - **User member** → effective: the role appears in the user's token.
  - **Service principal / managed identity member** → *not* effective: an app calling with its own identity only gets roles assigned directly to its service principal; group membership gives it nothing. Show it greyed out with a short explanation rather than hiding it, since it's usually a misconfiguration.
- Policy fetches can be numerous (one per operation). Limit concurrency (e.g. 8 in flight) and show progress.
- A backend entity can exist without any API using it. Show it as unused.
- The `__X__` placeholders in the reference policy are filled in at deploy time, so the live policies contain literal values. If a live policy still contains a `{{named value}}`, treat it as unresolved.