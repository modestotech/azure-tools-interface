# APIM Access Mapper

[![Deploy to GitHub Pages](https://github.com/modestotech/azure-tools-interface/actions/workflows/pages.yml/badge.svg)](https://github.com/modestotech/azure-tools-interface/actions/workflows/pages.yml)


Visualiserar vem som kan kalla operation i Azure API Management (APIM) API, och vart anropet går.

**Live:** https://modestosoftware.com/azure-tools-interface/

**Demo:** https://modestosoftware.com/azure-tools-interface/demo/ (syntetisk data, inget behov av riktiga Azure tokens)

## Vad gör appen

Man matar in 2 tokens, en för Entra och en för ARM (Azure Resource Manager), och väljer sedan Subscription, APIM-instans och ett API. För varje operation på API:t visas sedan vilka appar, användare och grupper som kan anropa den, samt vart anropet routas i backenden. Utöver detta flaggar den för potentiella problem relaterat till bl. a. säkerhet, och möjliggör export till CSV och JSON. 

> Har man ingen Entra-token, fungerar det även att köra med bara ARM, fast då får man ingen överblick över vilka användare etc. som kan anropa API:t.

## Komma igång

### Krav

- Node.js 24 LTS och pnpm (via Corepack)
- För riktig data: Azure CLI, `Reader` (eller `API Management Service Reader Role`) på APIM-instansen, och directory read access i Entra för full visualisering

### Installation

```bash
git clone https://github.com/modestotech/azure-tools-interface
cd azure-tools-interface
corepack enable pnpm
pnpm install
```

### Konfiguration

> Det finns ingen `.env`-fil och inga secrets. Man kör `az login` för att lyfta ut tokens och klistrar in i appen. Dessa cachas inte och försvinner vid refresh.

```bash
# ARM: Krav
az account get-access-token --resource https://management.azure.com --tenant <TENANT_ID> --query accessToken -o tsv
# Graph: Behöves bara då man vill ha "ARM och Entra"
az account get-access-token --resource https://graph.microsoft.com --tenant <TENANT_ID> --query accessToken -o tsv
```

### Köra projektet lokalt

```bash
pnpm dev:demo     # syntetisk data, ingen token behövs
pnpm dev          # mot en riktig Azure-tenant
```

`pnpm build` bygger den statiska siten till `dist/`; `pnpm typecheck`, `pnpm lint` and `pnpm test` kör checkar.

## Architecture

En statisk ensidesapp utan server. Lagren är bara beroende i en riktning, vilket ESLint upprätthåller: views och scripts → domain → services → lib. `lib/http` är den skyddade HTTP-klienten och förfrågningsloggen. `services` innehåller anropen till ARM och Graph, som valideras med Zod. `domain` tolkar APIM-policyernas XML och kombinerar den med data från Entra till en gemensam åtkomstmodell. Views och scripts läser bara från den modellen och kopplas in via register. Regler och konventioner finns i `CLAUDE.md` och milstolpar under utvecklingen i `PROJECT_PLAN.md`.

```
azure-tools-interface/
├── src/
│   ├── app/           # skal, token-skärm, scope-väljare, sessionslager
│   ├── lib/           # HTTP-klient, skrivskydd, förfrågningslogg, JWT-kontroller
│   ├── services/      # anrop till ARM och Graph med tillhörande query-hooks
│   ├── domain/        # policy-tolk, mappning, fynd
│   ├── views/         # åtkomstgraf, operationstabell, principaler, backends
│   ├── scripts/       # skrivskyddade analyser av modellen
│   ├── components/    # gemensamma UI-komponenter, den Matrix-inspirerade förfrågningsloggen
│   └── test/          # anonymiserade fixturer och MSW-mockar
├── tests/security/    # källkodsskanning och kontroller av produktionsbygget
├── security.config.ts # Content Security Policy och hosting-headers
└── .github/workflows/ # kontroller, bygge och driftsättning till GitHub Pages
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

## Begränsningar

- Analyserar ett API i taget, aldrig en hel APIM-instans.
- Stöder ett enda mönster för APIM-policyer baserat på min nuvarande kunds användning (`validate-jwt` med obligatoriska roller, `set-backend-service` och autentisering mot backend med managed identity). Allt annat flaggas som "behöver manuell granskning" och tolkas inte.
- Identifierar backends via URL. Azure-resursen bakom dem slås inte upp.
- Token klistras in manuellt och gäller i ungefär en timme. Det är en begränsning, men ett medvetet val: verktyget fordrar då inte en egen appregistrering och att ett inloggningsflöde för delegerade behörigheter sätts upp.

## Utvecklad med

Claude Code (agentdriven utveckling) som del av kursen Next-Generation Software Development with AI.

## CV-punkt

Designade och utvecklade med hjälp av agentdriven utveckling (Claude Code) en webbapp som visualiserar åtkomst (genom Azure Entra) till Azure API Management-API:er, samt hur API:erna är uppsatta. Appen visar samband som är svåra att överblicka genom portalen, eller enstaka CLI-anrop. Bland annat följande tekniker användes: React, TypeScript, TanStack Query, React Flow och Tailwind CSS. Den är tillgänglig på https://modestotech.github.io/azure-tools-interface/.