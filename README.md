# APIM Access Mapper

[![Deploy to GitHub Pages](https://github.com/modestotech/azure-tools-interface/actions/workflows/pages.yml/badge.svg)](https://github.com/modestotech/azure-tools-interface/actions/workflows/pages.yml)

Shows who can call each operation of an Azure API Management (APIM) API, and where the call goes, by reading APIM policies and Microsoft Entra ID straight from the browser.

**Live:** https://modestosoftware.com/azure-tools-interface/

**Demo:** https://modestosoftware.com/azure-tools-interface/demo/ (fictional data, no Azure account needed: click "Fill in demo tokens")

The demo is the quickest way to see how it works: the access graph, the tables, the findings and the live request log, all on a fictional API.

## What it does

You pick a subscription, an APIM instance and one API. For each operation, the app shows the policy that protects it, which apps, users and groups can call it (directly or through a group), the backend it routes to and how APIM authenticates there. It flags problems such as operations anyone can call, plain-HTTP backends, group members that get nothing from the group, and policy it can't interpret, and every table and analysis exports to CSV or JSON.

## Security

The app handles Azure tokens, so it's built to be easy to trust:

- **No backend.** The browser talks only to Azure Resource Manager and Microsoft Graph. The Content Security Policy blocks every other destination.
- **Tokens in memory only.** Never in `localStorage`, `sessionStorage`, cookies, URLs or logs. "Clear session" wipes tokens and all loaded data.
- **Read-only, enforced twice.** The HTTP client sends only `GET` (plus Graph `$batch` of GETs), and a separate network guard, loaded before the app, refuses anything else. Tests record every request of a full run and check that the shipped JavaScript contains no write methods.
- **ARM-only mode.** Skips Microsoft Graph entirely. With a `Reader`-only account, Azure itself refuses any change.
- **Masked request log.** Subscription and tenant IDs are masked on screen and always in exports.
- **Isolated demo.** The demo's mock service worker only controls `/demo/`, never the real app.

## Getting started

### Requirements

- Node.js 24 LTS and pnpm (via Corepack)
- For real data: Azure CLI, `Reader` (or `API Management Service Reader Role`) on the APIM instance, and directory read access in Entra for the full mode

### Installation

```bash
git clone https://github.com/modestotech/azure-tools-interface
cd azure-tools-interface
corepack enable pnpm
pnpm install
```

### Configuration

None: no `.env` file and no secrets. Run `az login` and paste access tokens into the app at runtime:

```bash
# ARM: always needed
az account get-access-token --resource https://management.azure.com --tenant <TENANT_ID> --query accessToken -o tsv
# Graph: only for "ARM and Entra"
az account get-access-token --resource https://graph.microsoft.com --tenant <TENANT_ID> --query accessToken -o tsv
```

### Run the project

```bash
pnpm dev:demo     # fictional data, no token needed
pnpm dev          # against your own Azure tenant
```

`pnpm build` builds the static site into `dist/`; `pnpm typecheck`, `pnpm lint` and `pnpm test` run the checks.

## Architecture

A static single-page app with no server. Layers depend one way, enforced by ESLint: views and scripts → domain → services → lib. `lib/http` is the guarded HTTP client and request log; `services` holds the ARM and Graph calls, validated with Zod; `domain` parses APIM policy XML and joins it with Entra data into one access model. Views and scripts only read that model and plug in through registries. Rules and conventions are in `CLAUDE.md`, milestones in `PROJECT_PLAN.md`.

```
azure-tools-interface/
├── src/
│   ├── app/           # shell, token screen, scope picker, session stores
│   ├── lib/           # HTTP client, read-only guards, request log, JWT checks
│   ├── services/      # ARM and Graph calls and their query hooks
│   ├── domain/        # policy parser, mapper, findings
│   ├── views/         # access graph, operations table, principals, backends
│   ├── scripts/       # read-only analyses over the model
│   ├── components/    # shared UI, the Matrix-style request log
│   └── test/          # anonymized fixtures and MSW mocks
├── tests/security/    # source scan and production-build checks
├── security.config.ts # Content Security Policy and hosting headers
└── .github/workflows/ # checks, build and deploy to GitHub Pages
```

## Tech stack

| Component       | Choice                            | Reason                                                  |
| --------------- | --------------------------------- | ------------------------------------------------------- |
| Frontend        | Vite, React, TypeScript (strict)  | Fully static build, no server to host or secure         |
| Data fetching   | TanStack Query                    | Caching and per-resource loading and errors             |
| State           | Zustand                           | Small in-memory stores, easy to wipe on "Clear session" |
| Graph           | React Flow + elkjs                | Interactive, layered access graph                       |
| Charts / tables | ECharts, TanStack Table + Virtual | Summaries, and tables that stay fast on large tenants   |
| UI              | Tailwind CSS + shadcn/ui          | Accessible components that work under a strict CSP      |
| Validation      | Zod, fast-xml-parser              | Check every Azure response; parse policy XML in order   |
| Testing         | Vitest, Testing Library, MSW      | No live Azure calls in tests; MSW also powers the demo  |
| CI/CD           | GitHub Actions + GitHub Pages     | Typecheck, lint and tests gate every deploy             |

## Limitations

- Analyzes one API at a time, never a whole APIM instance.
- Supports one APIM policy pattern (`validate-jwt` with required roles, `set-backend-service`, managed-identity auth to the backend). Anything else is flagged "needs manual review", not interpreted.
- Shows direct group members only; nested groups aren't expanded.
- Identifies backends by URL; the Azure resource behind them isn't looked up.
- Azure public cloud only, not Azure Government or China.
- Tokens are pasted by hand and last about an hour.
- GitHub Pages can't send headers, so the hosted site has no `frame-ancestors` protection.
- The full "ARM and Entra" mode hasn't been checked against a live tenant yet.

## Developed with

Claude Code (agent-driven development) as part of the course Next-Generation Software Development with AI.
