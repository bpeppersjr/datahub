# Proposed additive CMS directory production — October 3, 2026

Plan 92 is superseded by Plan 93 after the cross-category completion view and retained CMS directory ZIP evidence service were committed. It remains preserved as historical planning evidence and is not authorized for execution.

- Run ID: `production-cms-directories-20261003-92`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-92.json`
- Exact confirmation SHA-256: `6f14b541c72c53cc7f0aa35e8152b0434e061ae72263834e4edef1f3244f1409`
- Plan file SHA-256: `b2909e51cc26a6b953640940a79e31343086f81a6b79b9d5cf105119f2ea4ba9`
- Planning repository commit: `10baf48`
- Created: `2026-10-03T03:19:02.282Z`

The retained-only plan contains the governed 25-source roster, four baseline/geographic inputs, four previously selected childcare inputs, retained childcare, Minnesota credential reporting, and retained CMS hospital and nursing-home directory cohorts. It has eight sequential build/verify stages, zero acquisition stages, and zero network stages.

The protected exact lookup `GET /api/business-map/zcta-economic-readiness?zcta=#####` now reads one governed ZCTA through a bounded prefix index. The index release `zcta-economic-readiness-index-5aa107ac56514b6cd56a530e066ca13e58f1c8033fbf4fb0867dfcac7f860c5c` binds 33,791 rows to source manifest `e7f46c55cd6b94b7af3ec19d73ea277c19c5653474ead7f5eb4145be67717720`; its manifest SHA-256 is `c1e24845df34fdffb303920f9bba46ee41d9ac92e7d09bc0734c4cf824887c3a`. It performs no network requests and writes no current pointer.

ZIP Economy displays model status and blockers, county-relationship coverage, 2020 Census population and housing context, ZIP Business Patterns publication status, source lineage, and limitations only when an exact same-code governed Census ZCTA exists. It does not output numeric ZIP GDP, demographic allocations, ZIP+4 geometry, official USPS status, current-business claims, or false zeroes. Not-found means only that no retained readiness row was found.

Real Electron acceptance verified state/category preservation, exact ZIP lookup, keyboard tabs, four unavailable demographic dimensions, 200% text without horizontal overflow, zero browser page errors, and zero non-GET browser API requests. The focused suite ran 32 tests with zero failures. The full repository gate ran 3,032 tests: 2,957 passed, 75 skipped, and zero failed. Lint completed with four pre-existing warnings and no errors; web and desktop builds, desktop control-plane smoke, exact 33,791-row index replay, TypeScript checks, targeted lint, and the production dependency audit passed.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 228,451,741,696 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and confirmation SHA-256. Plan 91 and every earlier CMS directory plan or approval are superseded. No source acquisition, network request, CMS production execution, or production pointer change occurred while preparing Plan 92.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-92 --expected-plan-sha256 6f14b541c72c53cc7f0aa35e8152b0434e061ae72263834e4edef1f3244f1409
```
