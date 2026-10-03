# Proposed additive CMS directory production — October 3, 2026

Plan 111 is the current clean-repository successor after adding the nonnumeric ZCTA GDP execution-readiness layer and the fail-closed, app-owned ACS ZCTA offline-admission foundation.

- Run ID: `production-cms-directories-20261003-111`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-111.json`
- Exact confirmation SHA-256: `e841827d6d82ca2f3fb968b8dc7bd21bd734e206c338e09f31d16c101d3b6f83`
- Plan file SHA-256: `bf52b3ef0a570cde2a69a270a9e6d1ef3717d04eae1f82a98056371679725937`
- Planning repository commit: `8246ce2`

The retained-only plan has eight sequential stages, zero acquisition stages, and zero network stages. It retains the governed source roster, baseline and geographic inputs, childcare, Minnesota credential reporting, and CMS hospital and nursing-home cohorts.

The pointer-free ZCTA GDP execution-readiness release contains all 33,791 governed 2020 Census ZCTAs. It records 30,576 as technically feasible only if the model is later approved and 3,215 as withheld. Rows retain relationship/count diagnostics, methods, vintages, reason codes, and provenance without any numeric GDP estimate, component, industry amount, demographic amount, USPS ZIP claim, approval, or output authorization. County-industry GDP, a governed NAICS-to-BEA concordance, and nonemployer ZIP allocation remain unavailable.

The ACS admission foundation accepts only a closed, locally supplied package after its official metadata and authorization hashes are entered into the pinned registries through a separately reviewed change. It validates the exact 33,791-ZCTA roster and 189 detailed-table base variables with raw E/M/EA/MA values, retains package provenance, and publishes only a pointer-free local-review release. The registries remain empty, no real ACS release exists, readiness flags remain false, and no network acquisition or production enrollment is available.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 183,729,938,432 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

Focused integration suites passed 75/75. TypeScript, ESLint, web and desktop builds, desktop control-plane smoke, and the stop/relaunch lifecycle passed. Independent adversarial reviews corrected GDP artifact-substitution and ACS admission/verification defects before publication. The relaunched collector has exactly one port 4300 listener.

This document and plan do not constitute approval. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 110 and all earlier plans or approvals are superseded. No source acquisition, network request, reconciliation execution, or production pointer change occurred while preparing Plan 111.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-111 --expected-plan-sha256 e841827d6d82ca2f3fb968b8dc7bd21bd734e206c338e09f31d16c101d3b6f83
```
