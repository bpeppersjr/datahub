# Proposed additive CMS directory production — October 3, 2026

Plan 91 is the current clean-repository successor after committing the simplified tab workspace and governed ZCTA economic-model readiness release.

- Run ID: `production-cms-directories-20261003-91`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-91.json`
- Exact confirmation SHA-256: `1c11bb9f27f03fc57788e03892e7d3ca7c945effc3844d48575398540bfde69d`
- Plan file SHA-256: `127c64a93e4ffb9bf30a01e06f3346ac82de89a2839d7d4bd16190fe739a85cb`
- Planning repository commit: `e2ee981`
- Created: `2026-10-03T02:19:41.527Z`

The retained-only plan contains the governed 25-source roster, four baseline/geographic inputs, four previously selected childcare inputs, retained childcare, Minnesota credential reporting, and retained CMS hospital and nursing-home directory cohorts. It has eight sequential build/verify stages, zero acquisition stages, and zero network stages.

The app now presents four primary workspaces—Coverage, Industries, ZIP Economy, and Operations. Jobs, Collection, Evidence, and Connectors are accessible Operations subtabs. The duplicate icon rail is removed; job actions appear only in Operations / Jobs. Industries is summary-first, shares selected state/category context with Coverage, and keeps measured, unmeasured, source-row, GDP, and all-business-completeness semantics separate. Real Electron acceptance confirmed navigation, state/category preservation, 200% text, keyboard tabs, zero browser page errors, and zero non-GET API calls during the synthetic flow.

The pointer-free release `zcta-economic-model-readiness-20261003T021732755Z-e4adc3cd` binds the exact retained Census geography, BEA CAGDP1, ZCTA–county relationship, and ZBP releases. Manifest SHA-256 is `e7f46c55cd6b94b7af3ec19d73ea277c19c5653474ead7f5eb4145be67717720`. Independent source replay verified 33,791 governed 2020 ZCTA rows and 21,653,285 derived bytes. All rows remain withheld from GDP modeling; 623 have incomplete direct-county-GDP relationship coverage. The release contains no numeric ZIP GDP, demographic allocation, ZIP+4, official-USPS-ZIP, current-business, pointer, or production claim.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 228,527,521,792 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

Independent reviews closed all critical and moderate findings after source-replay, schema, conservation, canonical path/link, cancellation, and interaction-test repairs. The focused combined suite ran 27 tests with zero failures. The full repository gate ran 3,019 tests: 2,944 passed, 75 skipped, and zero failed. Lint completed with four pre-existing warnings and no errors; web and desktop builds, desktop control-plane smoke, 200% keyboard UI acceptance, and production dependency audit passed.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and confirmation SHA-256. Plan 90 and every earlier CMS directory plan or approval are superseded. No source acquisition, network request, CMS production execution, or production pointer change occurred while preparing Plan 91.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-91 --expected-plan-sha256 1c11bb9f27f03fc57788e03892e7d3ca7c945effc3844d48575398540bfde69d
```
