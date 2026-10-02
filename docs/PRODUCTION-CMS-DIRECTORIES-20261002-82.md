# Proposed additive CMS directory production — October 2, 2026

Plan 82 is the current clean-repository successor after adding a source-bound, non-publishing county coverage adapter for the retained Pennsylvania and Maryland childcare cohort.

- Run ID: `production-cms-directories-20261002-82`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261002-82.json`
- Exact confirmation SHA-256: `94c91cdf395a1e3769e8717336b6157f70210cc9201ed9f3a69e7c68925f8102`
- Plan file SHA-256: `e37ed1d56621fc376e47a7f779ac87f8e869101ab64b0aa744a0e8f94542e556`
- Planning repository commit: `3f28f09e14a23adb089ae8f7da84ea3ddbfab59f`
- Retained childcare county adapter commit: `3f28f09e14a23adb089ae8f7da84ea3ddbfab59f`
- Created: `2026-10-02T15:19:19.799Z`

The retained-only plan contains the governed 25-source roster, four baseline/geographic inputs, four previously selected childcare inputs, retained childcare, Minnesota credential reporting, and the retained CMS hospital and nursing-home directory cohorts. It has eight sequential build/verify stages, zero acquisition stages, and zero network stages.

The new adapter verifies the exact retained childcare cohort across the older county-relationship snapshot and current registry snapshot before exposing a separate derived county-reporting metric. Of 12,206 retained candidates, 6,702 have a single county assignment (4,930 Pennsylvania and 1,772 Maryland), 4,028 lack a source point, and 1,476 have an unknown coordinate reference system. It does not change reported state or ZIP fields, publish artifacts, move pointers, enroll the cohort in the national denominator, assert current operations, or claim national completeness. Unsupported geographies remain unavailable rather than becoming false zeroes.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 237,985,615,872 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

Repository verification includes 2,846 tests: 2,776 passed, 70 skipped, and zero failed. The separately opted-in full retained adapter replay passed 5 of 5 tests against the actual 12,206-record cohort. Lint, web build, desktop build, desktop smoke, desktop control-plane, dependency audit, shutdown, health restoration, and single-listener checks passed. `/api/health` returned healthy, and exactly one loopback listener remained.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 81 and every earlier CMS directory plan or approval are superseded. No source acquisition, network request, production execution, production pointer change, or governed evidence rebuild occurred while preparing Plan 82.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261002-82 --expected-plan-sha256 94c91cdf395a1e3769e8717336b6157f70210cc9201ed9f3a69e7c68925f8102
```
