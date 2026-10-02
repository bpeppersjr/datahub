# Proposed additive CMS directory production — October 2, 2026

Plan 72 is the current clean-repository successor after the focused-workspace implementation, Colorado retained-release reconciliation, and Plan 71 governance history were committed and pushed.

- Run ID: `production-cms-directories-20261002-72`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261002-72.json`
- Exact confirmation SHA-256: `723fe64675d80918b646afcaa2025825733a3cd25da2fdfa42a1cbd6066590d3`
- Plan file SHA-256: `3f4f1124aef5a7cb240272f6b29dbf66ab563814e8278decd4f340f59d29525a`
- Planning repository commit: `6ac0806726dac0e31d2cf4b0f2da36e7cda0c090`
- Focused-workspace implementation commit: `a13abe65b2829860a6c58e7999a387df79bb3808`
- Colorado reconciliation commit: `3e1321680992a8df8fa99892bf70fba86c4f49af`
- Created: `2026-10-02T07:17:26.590Z`

The retained-only plan contains the governed 25-source roster, four baseline/geographic inputs, four previously selected childcare inputs, retained childcare, Minnesota credential reporting, and the retained CMS hospital and nursing-home directory cohorts. It has eight sequential build/verify stages, zero acquisition stages, and zero network stages.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 234,248,552,448 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

Verification supporting this plan includes the repository-wide 2,824-test gate with zero failures, web and desktop builds, desktop control-plane smoke, focused workspace tests, TypeScript, zero production dependency vulnerabilities, Colorado's 16/16 focused tests, independent retained-release verification, a clean stop/relaunch sequence, one healthy loopback listener, and visual checks of Coverage, Industries, and ZIP Economy.

The Collector now defaults to tab-focused workspaces. The state choropleth uses the exact versioned dataset-availability matrix and shows unmeasured values separately; it does not claim all-business completeness. Industry shares remain source-category evidence, not business-universe or GDP shares. ZIP evidence remains distinct from ZCTA geography and ZIP+4. ZIP GDP, industry-segment GDP, and demographic GDP are withheld until separate governed modeled-product contracts and inputs exist.

Colorado remains bound to retained release `co-business-registry-20260903-002916547Z-ed08beca`: 2,164,812 source rows equal 2,164,811 published organizations plus one quarantined Delinquent row. Published status counts are 1,019,372 Good Standing and 1,145,439 Delinquent. There are 2,150,360 eligible reported U.S. business addresses and 14,451 organizations without one. No physical-site, establishment, premise-geocode, ownership, or completeness inference was added.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 71, Plan 70, and every earlier CMS directory plan or approval are superseded. No source acquisition, network request, production execution, production pointer change, or governed evidence rebuild occurred while preparing Plan 72.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261002-72 --expected-plan-sha256 723fe64675d80918b646afcaa2025825733a3cd25da2fdfa42a1cbd6066590d3
```
