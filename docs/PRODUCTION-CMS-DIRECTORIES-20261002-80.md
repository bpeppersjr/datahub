# Proposed additive CMS directory production — October 2, 2026

**Superseded without execution by Plan 81 after configured industries outside national reporting were exposed in the app. Do not execute or approve Plan 80.**

Plan 80 is the current clean-repository successor after the national resolution, benchmark, and coverage catalogs were reconciled to the exact retained September 11 release chain.

- Run ID: `production-cms-directories-20261002-80`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261002-80.json`
- Exact confirmation SHA-256: `9ff5cf429d4224b9d468e87893b0d8c8ff5c939bee6949da34f4594f45757505`
- Plan file SHA-256: `d494d04691ade4194367a546a3b89c29b904d2c0c94356631831ff567f407027`
- Planning repository commit: `cd795bd36c3fb5fb7a1483c83df47e933460ad57`
- Release-chain catalog reconciliation commit: `cd795bd36c3fb5fb7a1483c83df47e933460ad57`
- Created: `2026-10-02T13:42:31.003Z`

The retained-only plan contains the governed 25-source roster, four baseline/geographic inputs, four previously selected childcare inputs, retained childcare, Minnesota credential reporting, and the retained CMS hospital and nursing-home directory cohorts. It has eight sequential build/verify stages, zero acquisition stages, and zero network stages.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 238,704,160,768 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

The resolution, benchmark, and coverage catalogs now bind their current pointers, manifest hashes, release identities, dependency hashes, headline totals, and artifact totals to the same retained registry-to-coverage chain. The drift test preserves 13,182 reporting-only locations, 12,206 retained childcare candidates, and 11,456 Minnesota credential rows as distinct evidence populations. It also conserves all 48,194 ZIP rows across Census-ZCTA, record-contribution, and employer-baseline partitions.

The spatial denominator remains 33,791 Census ZCTA5 polygons. The current operational USPS denominator remains `null`, ZIP4 remains separate and non-geometric, active or licensed source status is not promoted to verified operation, and all-business completeness remains unmeasured. Repository verification includes 2,836 tests: 2,767 passed, 69 skipped, and zero failed. Lint, web build, desktop build, desktop control-plane, and dependency audit passed. The required stop/relaunch sequence completed, `/api/health` returned `ok`, and exactly one loopback listener remained.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 79 and every earlier CMS directory plan or approval are superseded. No source acquisition, network request, production execution, production pointer change, or governed evidence rebuild occurred while preparing Plan 80.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261002-80 --expected-plan-sha256 9ff5cf429d4224b9d468e87893b0d8c8ff5c939bee6949da34f4594f45757505
```
