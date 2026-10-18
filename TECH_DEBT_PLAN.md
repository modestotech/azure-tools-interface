# Kodanalys: läsbarhet, duplicering och teknisk skuld (M0–M1 + framåtblick)

## Context
Användaren vill ha en **analys, inte en lösning**. Kodbasen är i M1 (≈480 rader produktionskod i `src/lib/http`, `src/lib/token`, `src/app/session`, plus tester och MSW). Analysen täcker (A) befintlig kod och (B) risker som syns när CLAUDE.md/PROJECT_PLAN.md M2–M8 byggs ovanpå. Inga ändringar görs. Prioritet: **H** = åtgärda innan M2, **M** = innan respektive milstolpe, **L** = nice-to-have.

Helhetsintryck: koden är ren, välkommenterad och väl testad. Skulden ligger mest i *var saker bor* och *vad som händer när fler lager läggs på*.

---

## A. Befintlig kod

### A1. Lagerbrott: `httpClient` bor i `app/` (H)
`src/app/session/httpClient.ts` är den enda konfigurerade klienten. `services/` (M2) kommer behöva den, men CLAUDE.md säger att beroenden går `views → domain → services → lib`. Om services importerar från `app/` blir lagren cirkulära i praktiken. Antingen injiceras klienten i services (parameter/kontext), eller så flyttas instansen till ett neutralt ställe.

### A2. Bas-URL:er och versioner dupliceras (H)
- `https://management.azure.com` / `https://graph.microsoft.com/v1.0` finns i `lib/token/resources.ts` (bara `origin`, ingen `/v1.0`), `lib/http/readOnly.ts` (`GRAPH_BATCH_URL`), `test/msw/handlers.ts` (`ARM`, `GRAPH`) och `lib/http/client.test.ts` (egna `ARM`, `GRAPH`).
- `client.test.ts:11` hårdkodar `api-version=2024-05-01` i stället för `APIM_API_VERSION`, så testet går sönder när versionen höjs.
- I M2 tillkommer ännu fler (Resources `2022-12-01`, en version per provider för `GET {resourceId}`). Det saknas en central plats för endpoints och api-versioner.

### A3. Två funktioner heter `tokenFor` men gör olika saker (M)
`sessionStore.ts:43` returnerar `string | undefined`. `client.ts:137` validerar och kastar fel. Namnen är lika men beteendet skiljer sig, vilket är lätt att blanda ihop vid läsning och felsökning.

### A4. Token-validering finns på två ställen och skiljer sig åt (M)
`client.ts:137` (decode + `isExpectedAudience`) och `lib/token/checks.ts` (`checkToken`) kontrollerar audience var för sig. Klienten kontrollerar **inte** expiry eller tenant, så en utgången token skickas ändå och ger en 401 i stället för ett tydligt fel innan anropet. JWT:n avkodas också vid varje `send` (varje sida och varje batch-chunk). Billigt, men samma arbete görs om och om igen.

### A5. `send()` i `client.ts` är för lång (M)
Rad 169–278 (~110 rader) blandar retry-loop, header-bygge, statusmappning till feltyper, JSON-parsning, bytesräkning och loggning. Varje gång en ny felkod eller ett nytt beteende läggs till (t.ex. 404-som-tomt, se A8) växer funktionen. Naturliga delar att bryta ut: `toHttpError(response, text)`, `parseJsonBody`, `fetchWithRetry`.

### A6. Retry-logiken finns i två varianter (M)
- `send` gör retry på **429 och 503**, men `batchChunk` gör det bara på **429** för sub-svar. 503 inne i en `$batch` görs inte om.
- `Math.min(wait, MAX_RETRY_WAIT_MS)` och `parseRetryAfter(...) ?? backoffMs(attempt)` upprepas.
- Retries ligger i två nivåer: `batchChunk` loopar upp till `maxRetries` och anropar `send`, som själv loopar upp till `maxRetries`. Värsta fallet blir runt 16 försök per chunk.

### A7. Batch tappar svar utan att säga till (M)
- `client.ts:331`: `results.get(r.id) ?? []` hoppar över sub-requests som saknar svar, så den som anropar kan inte upptäcka att ett svar fattas.
- `client.ts:404`: `pending.find` antar unika `id`, men det kontrolleras aldrig (varken i `batchBodySchema` eller över chunks).
- `find` i en loop ger O(n²), vilket är försumbart vid 20 requests men visar att invarianten inte är uttryckt.

### A8. 404 loggas som fel men är "tomt" för policies (H inför M2/M5)
Loggern stänger posten med `state: 'error'` och räknar upp `counters.errors` **innan** anroparen vet att 404 är förväntat. Planen (M5) vill rendera "404-as-empty dim", och CLAUDE.md säger att 404 på en policy betyder "ingen policy". Med den nuvarande designen visar loggen alla saknade operation-policies som fel. Dessutom måste varje service fånga `NotFoundError` själv, och den try/catch:en kommer att upprepas i varje service.

### A9. Två sätt att skilja feltyper åt (L)
Det finns både `kind`-fältet och subklasserna (`UnauthorizedError`, …), så man kan välja `instanceof` eller `isHttpError(e, 'forbidden')`. Med två mönster kommer båda att användas om vartannat i views. Strängen `api.toUpperCase()` upprepas fyra gånger i felmeddelanden. En visningsetikett i `API_RESOURCES` skulle räcka.

### A10. `requestLog`: prestanda och räknare som kan bli fel (M)
- `update()` mappar hela arrayen (upp till 2000 poster) vid varje `retry`/`finish` och skapar en ny array varje gång, så alla prenumeranter renderas om. Med cirka 100 policyanrop som strömmar i en Matrix-vy blir det många omrenderingar i onödan.
- Om `clear()` körs medan anrop pågår kommer senare `finish()` på id:n som inte längre finns ändå att höja `done` och `errors`. Räknarna stämmer då inte med posterna.
- `done` räknar ihop ok, error och cancelled. Namnet säger inte det.
- `exportableEntries` tar bort `rawUrl` genom att lista vad som *inte* ska med (denylist). Om ett nytt omaskerat fält läggs till senare följer det med i exporten. En allowlist är säkrare, särskilt eftersom maskeringen är ett säkerhetskrav.

### A11. Global state som moduler och nedrivning som måste hållas i synk (M)
`sessionStore`, `requestLogStore` och `httpClient` är singletons på modulnivå. `clearSession()` måste komma ihåg varje cache som håller data ("M4 also clears the TanStack Query cache here"). När selections-store, Query-cache och vy-state läggs till är det lätt att glömma en av dem. Det är ett säkerhetsrelevant löfte i safety notice ("wiping tokens and all fetched data").

### A12. Session-state som är svår att bygga ut (L)
- `setToken`/`tokenFor` väljer med en ternary på `api`. Ett tredje API eller en tredje token kräver ändringar på flera ställen, medan `Record<ApiKind, string>` skulle räcka.
- `subscriptionId` ligger i session-storen, men CLAUDE.md placerar *selections* i en egen Zustand-store. Det finns risk att sub/svc/api delas mellan två stores.

### A13. Små saker (L)
- `jwt.ts:72` behåller bara det första värdet om `aud` är en array.
- `maskText` bygger en ny `RegExp` vid varje anrop, och det sker flera gånger per request.
- `lib/http` beror på `lib/token` för endpoint-konfiguration (`API_RESOURCES.origin`). Endpoints är egentligen inte ett token-ansvar (se A2).
- Demo-data för `pnpm dev:demo` ligger under `src/test/msw/`. Det fungerar, men `handlers.ts` kommer att växa till en stor fil när M2 lägger till alla resurser.

### A14. Dokumentationen har redan börjat glida isär (M)
- `PROJECT_PLAN.md §4` nämner `src/lib/http/request.ts`, men filen heter `client.ts`.
- §1 har tomma rader före tabellen.
- CLAUDE.md och PROJECT_PLAN.md beskriver delvis samma regler (parsing, joins, out-of-scope), så två källor måste hållas i synk.

---

## B. Framåtblick: risker när M2–M8 byggs

### B1. Services (M2)
- **OData-filter med användardata:** `$filter=servicePrincipalNames/any(x:x eq '{audience}')`. Värdena kommer från policy-XML och måste escapas (`'` → `''`) och URL-kodas. Om varje service bygger URL:er med template strings blir det både en buggrisk och en injektionsrisk. URL- och filterbygget bör ligga på ett ställe.
- **Typer som glider isär:** Zod-scheman i services kommer att likna domäntyperna i `model.ts`. Utan en tydlig regel (Zod-typ → map-funktion → domäntyp) uppstår två typhierarkier som sakta divergerar.
- **Query keys:** utan en key-factory hamnar sträng-arrayer utspridda i hooks, och då blir invalidering och "Clear session" opålitliga.
- **SP-uppslag med `servicePrincipalNames`:** samma uppslag används för inbound-audience och outbound-resource. Det bör vara en funktion, inte två snarlika.
- **Fel per resurs:** utan en gemensam typ (`ResourceResult<T>` = data | forbidden | notFound | error) uppfinner varje vy sin egen felhantering.

### B2. Policy-parser (M3)
- `preserveOrder: true` ger råa nästlade arrayer. Om extractors läser dem direkt blir koden svårläst och skör. Planen nämner en typad trädhelper, och den bör finnas innan första extractorn skrivs.
- **Klassningslistor:** listorna över supported, response-only och unresolved bör vara datatabeller på ett ställe, inte `if`-kedjor i flera filer.
- **Sektioner:** `<base/>`-sammansättningen är samma för `inbound`/`backend`/`outbound`/`on-error`. Risken är fyra kopior eller specialfall för `inbound`.
- **`@(...)`-detektering:** gäller bara access- och routing-attribut och bara i `inbound`/`backend`. Regeln behöver vara explicit, annars smyger falska `UnresolvedRule` in från outbound.

### B3. Mapper, findings och scripts (M3/M7)
- **Samma findings i flera lager:** "operations with no auth", "HTTP backend", "no outbound auth" och "unresolved rules" är både findings i mappern (M3) och starter-scripts (M7). Om de implementeras två gånger kommer de att ge olika svar. Findings bör beräknas en gång i domänen, och scripts bör filtrera eller presentera dem.
- **`useAccessModel()`:** den orkestrerar en vattenfallskedja (API → ops → policies → audience → SP → roles → assignedTo → groups → members, samt backend → MI). Det riskerar att bli en jättehook som blandar fetch och domänlogik. Den rena `buildAccessModel(rawInputs)` bör hållas separat från hämtningen.
- **`model.ts` ska vara "stabil":** men `AccessEdge` ska bära både graf-topologi och detaljer. Om typen designas efter React Flow-behov läcker vy-krav in i domänen.

### B4. Vyer och UI (M4–M6)
- **Tunga beroenden:** React Flow, elkjs och ECharts är stora. Registry-poster bör lazy-laddas (`React.lazy`), annars växer startbundlen med varje vy.
- **elkjs:** kör synkront på huvudtråden om ingen worker används, vilket ger hack vid stora grafer.
- **Två virtualiseringar:** loggen och tabeller använder båda `@tanstack/react-virtual`. Om det inte görs en gemensam komponent blir det två implementationer.
- **CSP:** injiceras via både `<meta>` och `staticwebapp.config.json`. Två källor till samma policy kommer att glida isär om de inte genereras från en gemensam definition.

### B5. Test och MSW
- `handlers.ts` + fixtures: utan en struktur per resurs (fixtures → handler factory) blir demo-läget och testerna svåra att underhålla.
- Testerna delar modul-singletons (`sessionStore`, `requestLogStore`). Fler tester ökar risken för läckage mellan testfall om reset inte görs centralt i `setup.ts`.

---

## Föreslagen prioritering (om/när åtgärder ska göras)
1. **Innan M2:** A1 (var klienten bor och DI), A2 (central endpoint- och versionskonfiguration), A8 (404-som-tomt i klient och logg), B1 (URL/OData-byggare, query-key-factory, `ResourceResult`).
2. **Under M2–M3:** A5/A6/A7 (bryt upp `send`, enhetlig retry, batch-invarianter), B2 (trädhelper och klassningstabell), B3 (findings på ett ställe).
3. **M4–M5:** A10/A11 (loggprestanda, räknare, allowlist i export, central session-reset), B4.
4. **Löpande:** A3, A4, A9, A12–A14.

---

## Påverkade filer (om punkterna åtgärdas)

Ingenting är genomfört än. Listan är grupperad efter prioritet så att en delmängd kan väljas.

### Steg 1: innan M2 (H)

| Fil | Ändring | Punkt |
|---|---|---|
| `src/lib/token/resources.ts` | Lägg till `baseUrl` (Graph inkl. `/v1.0`) och visningsetikett per API. Bli den enda källan för endpoints | A2, A9 |
| `src/services/arm/apiVersion.ts` | Samla alla api-versioner här: APIM, Resources `2022-12-01` och en provider-tabell för `GET {resourceId}` | A2 |
| `src/lib/http/readOnly.ts` | Bygg `GRAPH_BATCH_URL` från `baseUrl`. Kräv unika `id` i `batchBodySchema` | A2, A7 |
| `src/lib/http/client.ts` | Lägg till ett alternativ där 404 betyder tomt (t.ex. `getJsonOptional` som returnerar `null`) och logga det som "empty", inte som fel | A8 |
| `src/lib/http/requestLog.ts` | Nytt slutläge för 404-som-tomt som inte räknas som fel | A8 |
| `src/lib/http/index.ts` | Exportera de nya delarna | — |
| `src/app/session/httpClient.ts` | Behålls i `app/`. Klienten injiceras i services (services tar emot `HttpClient` som parameter och importerar aldrig från `app/`). Dokumentera detta i filen | A1 |
| `src/test/msw/handlers.ts` | Importera bas-URL:er och api-version från `resources.ts`/`apiVersion.ts` | A2 |
| `src/lib/http/client.test.ts` | Ta bort de lokala `ARM`/`GRAPH`-konstanterna och använd `APIM_API_VERSION`. Testa 404-som-tomt | A2, A8 |
| `src/lib/http/requestLog.test.ts`, `readOnly.test.ts` | Testa det nya slutläget och unika batch-id:n | A7, A8 |
| **Ny:** `src/lib/http/odata.ts` | `odataString()` för escaping (`'` → `''`) och kodning av `$filter`-värden | B1 |
| **Ny:** `src/services/queryKeys.ts` | En key-factory för alla TanStack Query-nycklar | B1 |
| **Ny:** `src/services/result.ts` | Typen `ResourceResult<T>` (data / forbidden / notFound / error) för fel per resurs | B1 |

### Steg 2: under M2–M3 (M)

| Fil | Ändring | Punkt |
|---|---|---|
| `src/lib/http/client.ts` | Bryt upp `send()`, gör retry likadan för 429 och 503 i både vanliga anrop och batch, ta bort nästlade retries, rapportera saknade batch-svar, byt namn på den interna `tokenFor` (t.ex. `requireValidToken`) och återanvänd `checkToken` (inklusive expiry) | A3–A7 |
| **Ny (valfri):** `src/lib/http/retry.ts` | Gemensam beräkning av väntetid och backoff | A6 |
| `src/lib/token/checks.ts` | Exponera en kontroll som klienten kan återanvända | A4 |
| `src/lib/http/errors.ts` | Bestäm ett sätt att skilja feltyper åt (`kind`) och använd etiketten från `resources.ts` | A9 |
| `src/lib/http/client.test.ts` | Tester för 503 i batch, saknade svar och utgången token | A4–A7 |
| Kommande `src/domain/policy-parser/*`, `src/domain/mapper/*`, `src/domain/findings.ts` | Inga befintliga filer ändras. Riktlinjerna i B2/B3 följs när filerna skapas: trädhelper, klassningstabell, findings på ett ställe och en ren `buildAccessModel` | B2, B3 |

### Steg 3: M4–M5 (M)

| Fil | Ändring | Punkt |
|---|---|---|
| `src/lib/http/requestLog.ts` | Uppdatera via index i stället för att mappa hela listan, ignorera `finish` för okända id:n efter `clear()`, gör räknarnas namn tydligare och använd en allowlist i `exportableEntries` | A10 |
| `src/lib/http/requestLog.test.ts` | Tester för `clear()` medan anrop pågår och för exportens allowlist | A10 |
| `src/app/session/httpClient.ts` | `clearSession()` anropar ett centralt register för nedrivning, där Query-cache och stores registrerar sig | A11 |
| `src/app/session/sessionStore.ts` | `tokens: Record<ApiKind, string>`, byt namn på `tokenFor` och bestäm var `subscriptionId` ska ligga (i session- eller selections-storen) | A3, A12 |
| `src/app/session/sessionStore.test.ts` | Följ med namnbyten och nedrivningsregistret | A11, A12 |
| `src/test/setup.ts` | Central reset av singletons mellan tester | B5 |

### Löpande (L)

| Fil | Ändring | Punkt |
|---|---|---|
| `src/lib/token/jwt.ts` (+ `jwt.test.ts`) | Hantera `aud` som array fullt ut | A13 |
| `src/lib/http/mask.ts` | Bygg om regexarna bara när mask-värdena ändras | A13 |
| `PROJECT_PLAN.md` | Rätta `request.ts` → `client.ts` och ta bort de tomma raderna i §1 | A14 |
| `CLAUDE.md` | Eventuellt slå ihop dubblerade regler med PROJECT_PLAN (stäms av med dig först) | A14 |

**Rör inte:** `src/app/App.tsx`, `src/main.tsx`, `vite.config.ts`, konfigfiler och `public/*`.

---

## Genomförande: en commit per ändring

Du har uttryckligen godkänt commits (undantag från CLAUDE.md › Git för den här uppgiften). Arbetet görs på grenen `cleanup`. Före **varje** commit körs `pnpm typecheck && pnpm lint && pnpm test`, och committen görs bara om allt är grönt. Commit-meddelandet består av en rubrik plus en brödtext som förklarar varför, vad och vilken punkt (A/B) det gäller.

0. **Committa planen** som `TECH_DEBT_PLAN.md` i repots rot (kopia av den här filen). Det är den första committen på grenen.
1. **Centralisera endpoints och api-versioner** (A2): `resources.ts`, `apiVersion.ts`, `readOnly.ts`, `handlers.ts`, `client.test.ts`
2. **Behandla 404 som tomt i klient och logg** (A8): `client.ts`, `requestLog.ts`, `index.ts`, tester
3. **Batch: kräv unika id:n och rapportera saknade svar** (A7): `readOnly.ts`, `client.ts`, tester
4. **OData-helper för `$filter`-värden** (B1): ny `lib/http/odata.ts` + test
5. **Grundstenar för services: query keys, `ResourceResult` och dokumentation om DI** (B1, A1): nya `services/queryKeys.ts`, `services/result.ts` och en kommentar i `app/session/httpClient.ts`
6. **Dela upp `send()` och samma retry för 429/503 överallt** (A5, A6): `client.ts`, eventuellt ny `retry.ts`, tester
7. **Klienten återanvänder token-kontrollen inklusive expiry, plus namnbyte på `tokenFor`** (A3, A4): `client.ts`, `checks.ts`, `sessionStore.ts`, tester
8. **Ett sätt att skilja feltyper åt och API-etiketter** (A9): `errors.ts`, `resources.ts`, `client.ts`
9. **Request-logg: prestanda, korrekta räknare och export-allowlist** (A10): `requestLog.ts` + test
10. **Central session-reset** (A11): `httpClient.ts` (`clearSession`) + test
11. **Session-store med `Record<ApiKind, string>`** (A12): `sessionStore.ts` + test (`subscriptionId` ligger kvar tills selections-storen finns)
12. **Central reset av singletons i tester** (B5): `test/setup.ts`
13. **JWT `aud` som array och cachning av maskregexar** (A13): `jwt.ts`, `mask.ts`, tester
14. **Rätta PROJECT_PLAN** (A14): `PROJECT_PLAN.md`

Görs inte nu: ändringar i `CLAUDE.md` (stäms av separat) och B2–B4 (filerna finns inte än). Ingen push.

## Status

Steg 0–14 är genomförda på grenen `cleanup`, en commit per steg (se `git log`). Varje commit är grön på `pnpm typecheck && pnpm lint && pnpm test`.

Avvikelser från planen:

- Steg 1: provider-tabellen för `GET {resourceId}` är inte tillagd. Versionerna verifieras och läggs in i M2.
- Steg 7: klienten cachar avkodade claims. Steg 10 lade till `HttpClient.reset()` så att "Clear session" även tömmer den cachen (den höll tokensträngen). Steg 13 utökade `reset()` till att också glömma de cachade mask-ID:na.
- Steg 8: subklasserna (`UnauthorizedError` m.fl.) är ersatta av factory-funktioner. `azCommand` ligger på `HttpError` och sätts för både `unauthorized` och `token-expired`.

Kvar: ändringar i `CLAUDE.md` (stäms av separat) och B2–B4, som följs när de filerna skapas i M3–M6.

## Verifiering av analysen
Läs-bara verifiering av påståendena:
- `grep -rn "management.azure.com\|graph.microsoft.com" src` → bekräftar A2.
- `client.ts:211` vs `:321` → 503-skillnaden i A6.
- `requestLog.ts:125–143` → räknarna efter `clear()` i A10.
- Ingen kod ändras. Varje punkt kan tas upp som egen åtgärd senare.
