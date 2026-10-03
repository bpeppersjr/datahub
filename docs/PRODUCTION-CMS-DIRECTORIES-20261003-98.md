# Proposed additive CMS directory production — October 3, 2026

Plan 98 is the current clean-repository successor after committing the tab-focused Business Intelligence workspace and the pointer-free hospital/NPPES, pharmacy-registry, and ZIP-denominator readiness releases.

- Run ID: `production-cms-directories-20261003-98`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-98.json`
- Exact confirmation SHA-256: `145bd2152943d3087516ee652bd4e03c2ae21bb20c370db8bab9d8c421041a5f`
- Plan file SHA-256: `9a9839389d01f2f74702c756d6da0522e99e409879919e9211b887ea57cfce87`
- Planning repository commit: `f2717f0`

The retained-only plan contains the governed 25-source roster, the existing baseline/geographic inputs, retained childcare, Minnesota credential reporting, and retained CMS hospital and nursing-home directory cohorts. It has eight sequential stages, zero acquisition stages, and zero network stages.

The Business Intelligence area now uses three accessible tabs: State completion, Industry summaries, and ZIP GDP & demographics. State summary evidence remains beside the map. The ZIP view defaults to the governed GDP enhancer, but total extrapolated ZIP GDP, allocation by business segment, and demographic cross-view values remain visibly unavailable until governed numeric releases exist.

The pointer-free hospital/NPPES readiness release conserves 5,419 hospital rows and records 236 one-distinct-NPI review candidates, 317 ambiguous rows, and 4,866 unmatched rows without performing identity merges or upgrading current-operation, physical-site, or completeness claims.

The pointer-free pharmacy overlay reconciles 89,077 pharmacy records to the same NPPES identities already in the registry and enforces zero organization, site, establishment, and generic-business additivity. It exposes industry membership without double counting.

The pointer-free ZIP-denominator readiness release replays all 48,194 retained ZIP evidence keys and records the missing PostalPro and licensed City State prerequisites. The authoritative current USPS ZIP denominator and all related completion fields remain null.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 203,367,940,096 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

Focused UI, TypeScript, web build, desktop build, desktop control-plane, three native release verifiers, dependency audit, and all new release tests passed. The full 3,252-test concurrent gate reported two transient Utah retained-enrollment reads inside `state-access-ledger.test.mjs`; the entire 67-test file passed immediately in isolation. Lint completed with four pre-existing warnings and no errors.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and confirmation SHA-256. Plan 97 and every earlier CMS directory plan or approval are superseded. No source acquisition, network request, reconciliation execution, or production pointer change occurred while preparing Plan 98.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-98 --expected-plan-sha256 145bd2152943d3087516ee652bd4e03c2ae21bb20c370db8bab9d8c421041a5f
```
