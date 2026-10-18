# APIM Access Mapper

A client-side web app that maps **Azure API Management (APIM) policies** to the **Microsoft Entra ID identities** allowed to call them.

You pick a subscription, an APIM instance and one API. For that API, the app shows:

- each operation and the policies that protect it
- the service principals, users and groups that can call it
- the backend it routes to, and how APIM authenticates to that backend

There is no backend server. The browser calls Azure Resource Manager and Microsoft Graph directly with tokens you paste in. Tokens stay in memory only, and the app sends only read requests (`GET`).

> Status: early development. The token, HTTP and session layers are in place; the UI and analyses are still being built. See `PROJECT_PLAN.md`.

## Getting started

Requires a recent Node.js LTS and pnpm (via Corepack).

```bash
corepack enable pnpm
pnpm install
pnpm dev:demo     # run with fictional demo data, no Azure token needed
```

## Commands

| Command          | What it does                                     |
| ---------------- | ------------------------------------------------ |
| `pnpm dev`       | Start the dev server                             |
| `pnpm dev:demo`  | Start the dev server with mocked ARM/Graph data  |
| `pnpm build`     | Type-check and build a static site into `dist/` |
| `pnpm test`      | Run the unit tests                               |
| `pnpm lint`      | Run ESLint and the Prettier check                |
| `pnpm typecheck` | Run the TypeScript type check                    |

## Using it against Azure

Sign in with `az login`, then get one token per API and paste both into the app:

```bash
az account get-access-token --resource https://management.azure.com --tenant <TENANT_ID> --query accessToken -o tsv
az account get-access-token --resource https://graph.microsoft.com --tenant <TENANT_ID> --query accessToken -o tsv
```

Your account needs `Reader` (or `API Management Service Reader Role`) on the APIM instance, plus read access to the Entra directory. Use an account without write or Owner roles if you can.
