# Proposed additive CMS directory production — October 2, 2026

Plan 83 is the current clean-repository successor after adding source-bound ZIP temporal qualification, metadata-only registration of retained CMS directory evidence, and retained childcare county visibility in the simplified workspace.

- Run ID: `production-cms-directories-20261002-83`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261002-83.json`
- Exact confirmation SHA-256: `941192846223d87514091b80fb9a76df1988430d32cd92e6ddc88f076626a62c`
- Plan file SHA-256: `33a8f16f66bb45684b8fb2e77fbbcc5bb3baa758bed9bc4811bf1b3345165161`
- Planning repository commit: `bdfb3aa`
- Created: `2026-10-02T16:14:56.831Z`

The retained-only plan contains the governed 25-source roster, four baseline/geographic inputs, four previously selected childcare inputs, retained childcare, Minnesota credential reporting, and the retained CMS hospital and nursing-home directory cohorts. It has eight sequential build/verify stages, zero acquisition stages, and zero network stages.

The new ZIP qualification component is a read-only builder and replay verifier. It binds the current coverage, registry and ZIP artifact, preserves source-defined count units and overlaps, and distinguishes within-review-window, stale-review-due and unmeasured evidence. It never interprets those classifications as verified current operation, unique businesses, a USPS-valid ZIP denominator or all-business completeness. The effective export policy preserves the most restrictive upstream input.

The existing immutable CMS aggregate is now registered as pre-production metadata: 20,109 directory rows across 56 jurisdictions, comprising 5,419 hospital and 14,690 nursing-home rows. It has no runtime pointer or production/denominator enrollment and retains null business, site, current-operation and completeness claims.

The simplified Coverage and Industries workspaces expose retained Pennsylvania and Maryland childcare county evidence as a separate local layer. Supported zero differs from unavailable geography; assignment gaps and derivative timing are visible. National expectations, availability, counts and completion percentages remain unchanged.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 237,943,033,856 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

Repository verification includes 2,859 tests: 2,789 passed, 70 skipped, and zero failed. Lint, web build, desktop build, desktop smoke, dependency audit, shutdown, relaunch, health, and single-listener checks passed. Rendered Electron acceptance verified Pennsylvania/Maryland state selection, county drilldown and reset, supported zero, unsupported-state unavailable, unchanged national metrics, keyboard access and 200% text size, with zero page errors and zero non-GET browser requests.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 82 and every earlier CMS directory plan or approval are superseded. No source acquisition, network request, production execution, production pointer change, or governed evidence rebuild occurred while preparing Plan 83.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261002-83 --expected-plan-sha256 941192846223d87514091b80fb9a76df1988430d32cd92e6ddc88f076626a62c
```
