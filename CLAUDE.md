# CLAUDE.md

## Project overview

A client-side SPA that maps **Azure API Management (APIM) policies** to **Microsoft Entra ID identities**. Given an access token, a subscription and a tenant, it answers:

- Which APIs and operations exist in an APIM instance, and which policies protect them
- Which service principals (apps / managed identities) are allowed to call each operation
- Who those service principals are (display name, appId, owners, type)
- If access is granted through a group, who is in that group (transitive membership)

The results are shown as interactive visualizations (graph + tables). More visualizations and "scripts" (read-only analyses) will be added later, so the architecture must make adding new ones cheap.

There is **no backend**. The browser calls Azure Resource Manager and Microsoft Graph directly.

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
- Decode the JWT (no validation needed) to show `aud`, `tid`, `upn`/`oid` and `exp`. Warn if `aud` doesn't match the expected resource, if `tid` doesn't match the entered tenant, or if the token expires soon (they typically last ~60–90 min).
- On 401, surface a clear "token expired or wrong audience — re-run az command" message with the exact command to copy.
- The app is strictly **read-only**: only `GET` requests (plus Graph `$batch`, which wraps GETs). Never add calls that modify Azure or Entra.

Required permissions for the signed-in user: `Reader` (or `API Management Service Reader Role`) on the APIM instance; directory read access in Entra (the default Azure CLI Graph token works for reading service principals, groups and members in most tenants).

## Tech stack

- **Vite + React + TypeScript** (strict mode)
- **TanStack Query** for fetching, caching, retries and pagination
- **Zustand** for app state (session/tokens, selections, filters)
- **React Flow (@xyflow/react)** + **elkjs** for the access graph (operations → policies → service principals → groups → members)
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
- Policies at every scope (all `?format=rawxml`):
  - Global: `.../service/{svc}/policies/policy`
  - Product: `.../products/{productId}/policies/policy` (plus `.../products/{productId}/apis` to link products to APIs)
  - API: `.../apis/{apiId}/policies/policy`
  - Operation: `.../apis/{apiId}/operations/{opId}/policies/policy`
- Policy fragments: `.../policyFragments` (resolve `<include-fragment>`)
- Named values: `.../namedValues` (resolve `{{named-value}}` references; never display values marked `secret`)

A 404 on a policy endpoint means "no policy at that scope" — not an error.

### Entra (Microsoft Graph, `https://graph.microsoft.com/v1.0`)

- Service principal by appId: `/servicePrincipals(appId='{appId}')`
- The API's own service principal and its app roles: `appRoles` on the backend/API service principal
- Who holds app roles on the API: `/servicePrincipals/{id}/appRoleAssignedTo`
- Group details and transitive members: `/groups/{id}`, `/groups/{id}/transitiveMembers`
- Use `$select` to keep payloads small, `$batch` (max 20 requests per batch) for bulk lookups, follow `@odata.nextLink`, and honor `Retry-After` on 429.

## Policy parsing rules

The parser turns effective policy XML into `AccessRule`s. Key behaviors:

- Compute the **effective policy per operation** by applying `<base />` inheritance: global → product → API → operation. Each rule keeps its source scope so the UI can show where it came from.
- Expand `<include-fragment fragment-id="..."/>` and resolve `{{named values}}` before analysis.
- Extract access constraints from:
  - `<validate-azure-ad-token>`: `tenant-id`, `<client-application-ids>`, `<audiences>`, `<required-claims>`
  - `<validate-jwt>`: `<openid-config>` / issuer, `<audiences>`, `<required-claims>` (especially `roles`, `scp`, `appid`, `azp`)
  - `<check-header>` and other recognizable allow-lists of client IDs
- Map constraints to Entra:
  - Explicit client/app IDs → service principals
  - Required `roles` claim values → app roles on the API's service principal → `appRoleAssignedTo` → service principals, users and groups → group members
- Anything not understood (C# expressions `@(...)`, `<choose>` branches, custom logic) must be kept as an `UnresolvedRule` with the raw XML snippet and shown in the UI as "needs manual review". Never silently drop it or guess.
- Operations with no authentication policy at any scope are flagged explicitly.

## Domain model (normalized)

Core types live in `domain/model.ts`. Keep them stable — views and scripts depend on them.

- `ApimService`, `Api`, `Operation`, `Product`
- `PolicyDocument` (scope, raw XML, parsed tree)
- `AccessRule` (operation, source scope, kind, constraint values) and `UnresolvedRule`
- `Principal` — discriminated union: `ServicePrincipal` | `User` | `Group` | `ManagedIdentity`
- `AppRole`, `AppRoleAssignment`, `GroupMembership`
- `AccessEdge` — the graph edge set the visualizations render (`operation → rule → principal → group → member`)

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
- `roles` in a token can come from direct app role assignments to a service principal, or from group assignments for users; groups are **not** expanded for app-only (client credentials) tokens, so service principals inside groups do not get roles via the group. Show group-based assignments, but label this nuance in the UI.
- Policy fetches can be numerous (one per operation). Limit concurrency (e.g. 8 in flight) and show progress.
