# samples-raw/

Drop raw samples captured from a real tenant here (policy XML, ARM/Graph JSON, error bodies). Everything in this folder except this README is gitignored.

Claude reads these, then writes **anonymized** copies to `src/test/fixtures/`. Only the anonymized copies are committed.

Anonymizing rules (see PROJECT_PLAN.md §6):

- GUIDs → `00000000-0000-0000-0000-00000000000N`
- Tenant and company names → `contoso`
- Hostnames → `*.example.net`
- Keep structure and attribute names untouched

Never put tokens here, not even expired ones.
