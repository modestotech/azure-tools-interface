# APIM Access Mapper

[![Deploy to GitHub Pages](https://github.com/modestotech/azure-tools-interface/actions/workflows/pages.yml/badge.svg)](https://github.com/modestotech/azure-tools-interface/actions/workflows/pages.yml)

A client-side web app that maps **Azure API Management (APIM) policies** to the **Microsoft Entra ID identities** allowed to call them.

You pick a subscription, an APIM instance and one API. For that API, the app shows:

- each operation and the policies that protect it
- the service principals, users and groups that can call it, and why (a role held directly, or through a group)
- the backend it routes to, and how APIM authenticates to that backend
- findings: operations anyone can call, plain-HTTP backends, group members that get nothing from the group, policy elements to review by hand, and more

There is no backend server. The browser calls Azure Resource Manager and Microsoft Graph directly with tokens you paste in. Tokens stay in memory only, and the app sends only read requests (`GET`, plus Graph `$batch` of GETs).

The app targets one APIM pattern (`validate-jwt` with required roles, `set-backend-service`, managed-identity auth to the backend; see `PROJECT_PLAN.md` §1). Anything outside it is flagged as "needs manual review", never guessed.

## What's in it

- **Overview**: auth coverage and findings by kind, plus the scripts with how much each finds
- **Operations**: every operation with its auth, callers, backend, outbound auth and findings; CSV/JSON export
- **Access graph**: group member → role holder → operation → backend. Groups expand on request; filter by operation on large APIs
- **Principals**: pick an app, user or group and see which operations it can call, and why
- **Backends**: URL, TLS, the credential mechanism (never its value), and the roles APIM's identity holds there
- **Scripts**: read-only analyses (operations with no auth, principals with access to more than N operations, ineffective group members, backend issues, unresolved rules), each exportable
- **Request log**: every request the app makes, live, with subscription and tenant IDs masked

## Getting started

Requires a recent Node.js LTS and pnpm (via Corepack).

```bash
corepack enable pnpm
pnpm install
pnpm dev:demo     # fictional demo data, no Azure token needed: click "Fill in demo tokens"
```

Or try the hosted demo, with the same fictional data: https://modestosoftware.com/azure-tools-interface/demo/

## Commands

| Command          | What it does                                     |
| ---------------- | ------------------------------------------------ |
| `pnpm dev`       | Start the dev server                             |
| `pnpm dev:demo`  | Start the dev server with mocked ARM/Graph data  |
| `pnpm build`     | Type-check and build a static site into `dist/`  |
| `pnpm preview`   | Serve the built site locally                     |
| `pnpm test`      | Run the unit tests                               |
| `pnpm lint`      | Run ESLint and the Prettier check                |
| `pnpm typecheck` | Run the TypeScript type check                    |

## Using it against Azure

Sign in with `az login`, choose a mode on the token screen, and paste the token(s):

```bash
# ARM: always needed
az account get-access-token --resource https://management.azure.com --tenant <TENANT_ID> --query accessToken -o tsv
# Graph: only for "ARM and Entra"
az account get-access-token --resource https://graph.microsoft.com --tenant <TENANT_ID> --query accessToken -o tsv
```

- **ARM only:** just the ARM token. Use an account with only `Reader` (or `API Management Service Reader Role`) on the APIM instance, and Azure itself refuses any change. You get operations, policies, backends, outbound auth and the findings those show. You don't get who can call.
- **ARM and Entra:** also the Graph token, for who holds the API's roles and who is in the groups. A Graph token from the Azure CLI can do whatever your account may do in Entra, so prefer an account with no Entra admin roles that owns no apps or groups.

Either way the app only reads. Two separate guards refuse anything else before it leaves the browser; in ARM-only mode they also refuse every request to Graph.

Tokens last about an hour. When one expires, the app says so and shows the command to run again; "Clear session" wipes tokens, selections and loaded data.

## Deploying

`pnpm build` produces a static `dist/` for Azure Static Web Apps or a Storage static website. The build adds the Content Security Policy to `index.html` and writes `staticwebapp.config.json` with the routing fallback and security headers. The policy only allows connections to ARM and Graph.

Every push to `main` is checked, built and deployed to GitHub Pages by `.github/workflows/pages.yml`: the app at https://modestosoftware.com/azure-tools-interface/ and the demo under `/demo/`. Pages can't set headers, so there the policy comes from the `<meta>` tag only.

## Documentation

- `CLAUDE.md`: rules, conventions and architecture
- `PROJECT_PLAN.md`: target pattern, milestones and status
