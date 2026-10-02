# Proposed additive CMS directory production — October 2, 2026

Plan 73 is the current clean-repository successor after the focused-workspace implementation, Colorado retained-release reconciliation, New York retained-catalog reconciliation, and Plan 72 governance history were committed and pushed.

- Run ID: `production-cms-directories-20261002-73`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261002-73.json`
- Exact confirmation SHA-256: `deb5a41288bccb2b594559705c675a700e60a292e4a9d51590b7ca6065a98c8e`
- Plan file SHA-256: `4ec49e5d81d5d28ac42a7acfe85f7fe1b376fb0ccf4fe75c5270d265c9f9cd59`
- Planning repository commit: `4c4b31ab22d1e3ea7e15a21d304ea8ea410f2f9f`
- Focused-workspace implementation commit: `a13abe65b2829860a6c58e7999a387df79bb3808`
- Colorado reconciliation commit: `3e1321680992a8df8fa99892bf70fba86c4f49af`
- New York reconciliation commit: `4c4b31ab22d1e3ea7e15a21d304ea8ea410f2f9f`
- Created: `2026-10-02T08:01:22.478Z`

The retained-only plan contains the governed 25-source roster, four baseline/geographic inputs, four previously selected childcare inputs, retained childcare, Minnesota credential reporting, and the retained CMS hospital and nursing-home directory cohorts. It has eight sequential build/verify stages, zero acquisition stages, and zero network stages.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 233,488,097,280 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

Verification supporting this plan includes 2,825 repository tests: 2,756 passed, 69 skipped, and zero failed. Discovery, assessment, connector, lint, web-build, and desktop-build gates passed. The first full gate's final desktop smoke encountered the already-running collector on port 4300; after the required `stop-collector.bat` sequence, the desktop control-plane smoke passed, the app relaunched successfully, `/api/health` returned `ok`, and exactly one loopback listener remained. The production dependency audit reported zero vulnerabilities. Independent review found no acquisition, promotion, network, physical-site, or establishment inference.

The Collector defaults to tab-focused workspaces. The state choropleth uses the exact versioned dataset-availability matrix and shows unmeasured values separately; it does not claim all-business completeness. Industry shares remain source-category evidence, not business-universe or GDP shares. ZIP evidence remains distinct from ZCTA geography and ZIP+4. ZIP GDP, industry-segment GDP, and demographic GDP are withheld until separate governed modeled-product contracts and inputs exist.

New York's catalog is now reconciled to retained release `ny-business-registry-20260903-005209518Z-d9e3551f`: 4,273,072 source rows equal 4,273,072 published organizations and zero quarantined records. There are 350,933 eligible reported U.S. location addresses, 3,922,139 organizations without one, 8,646 source ZIP codes, and 38,513 union ZIP records. `physical_sites` and `establishments` remain `null`; no acquisition, source refresh, or production pointer change occurred.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 72, Plan 71, Plan 70, and every earlier CMS directory plan or approval are superseded. No source acquisition, network request, production execution, production pointer change, or governed evidence rebuild occurred while preparing Plan 73.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261002-73 --expected-plan-sha256 deb5a41288bccb2b594559705c675a700e60a292e4a9d51590b7ca6065a98c8e
```
