# Proposed additive CMS directory production — September 23, 2026

> **Superseded without execution.** Implementation commit `702e00c` added the governed immutable registry ZIP evidence-key delta review after this plan was prepared, invalidating this plan's code fingerprint. Run `production-cms-directories-20260923-58` was never approved or executed and must not be used. It is replaced by `production-cms-directories-20260923-59` and the exact confirmation SHA recorded in `docs/PRODUCTION-CMS-DIRECTORIES-20260923-59.md`.

Fresh governed planning completed after implementation commit `48f76e316c8ccd32ab8d3e9b8fb3901f0dee5289`. That commit adds a protected read-only Co*Tive view over the exact immutable reported-organization ZIP evidence release. The view verifies the manifest and all 108 retained shards through stable file handles, enforces configuration and schema safety declarations, preserves source export restrictions, and exposes only non-additive aggregate management evidence.

- Run ID: `production-cms-directories-20260923-58`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260923-58.json`
- Exact confirmation SHA-256: `045469b5d74d519cdfbdccd7405d597c230027a300ad1c03ff95268856add573`
- Planning implementation commit: `48f76e316c8ccd32ab8d3e9b8fb3901f0dee5289`

The retained-only plan includes the governed production source roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. The CMS rows remain local-review-only publisher directory records, not verified unique businesses, physical sites, or current operations.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has zero source-acquisition or network stages. No USPS dependency is selected.

Read-only exact-plan preflight returned `READY`; all current pins and retained inputs were reconstructed and verified, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 238,981,726,208 bytes and the current-output rebuild floor was 13,309,329,011 bytes.

The final clean repository suite passed 2,602 tests: 2,533 passed, 69 intentionally skipped, zero failed, and zero cancelled. Focused and live security checks passed 9/9. Lint, production web and desktop builds, exact retained-release verification, independent code/security review, runtime restoration, health, and single-listener checks passed.

Immutable release `broad-organization-zip-evidence-20260923-002630301Z-9cdbdcd319f2`, manifest SHA-256 `ee5896c32daf5b50a8b1ac44717ccd4a3005b91d1ca65dfc869c04490d441a7e`, contains a manifest plus 108 shards. It conserves 14,340,575 input records into 14,340,583 administrative-address evidence rows, including 9,940,777 eligible ZIP rows and 4,399,806 missing or ineligible rows across Colorado, Connecticut, Delaware, Florida, Iowa, New York, Oregon, and Pennsylvania. These are not businesses, sites, current operations, USPS-valid ZIPs, or ZCTA geometry; they do not change general-business or site totals. Delaware record-level evidence remains local-review-only, and every source policy remains authoritative.

Immutable geography-status release `national-geography-goal-status-20260923204343-55952349`, manifest SHA-256 `5b933dcda10c3c063a5a10ce3ed83c5391eb17b80ad807a768870b1c8bf5aaad`, continues to keep Census polygon completeness separate from the unverified operational ZIP denominator. Immutable matrix release `national-goal-completion-20260923152841-e96af677` remains the broad-layer evidence view: 11/51 jurisdictions admitted and 40 unresolved data gaps.

The four document-only inquiry proposals remain `PROPOSED`, `NOT APPROVED`, and `NO ACTION AUTHORIZED`. Proposal and packet coverage is not collected-data coverage.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 57 and every earlier CMS directory plan or approval are superseded. No production execution occurred while preparing this plan.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260923-58 --expected-plan-sha256 045469b5d74d519cdfbdccd7405d597c230027a300ad1c03ff95268856add573
```
