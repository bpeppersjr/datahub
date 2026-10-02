# Proposed additive CMS directory production — October 2, 2026

Plan 85 is the current clean-repository successor after publishing and independently verifying the pointer-free ZIP lookup index, registering it, and connecting its bounded authenticated reader to ZIP Economy.

- Run ID: `production-cms-directories-20261002-85`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261002-85.json`
- Exact confirmation SHA-256: `aa1b1bf868fa56b65f776f8e886666cdbe543dc683b73b97a2d9c633413f8084`
- Plan file SHA-256: `fbd684265f9bece067a040d641860651ba4c1a20b9ea2f6d23a5fe4156519709`
- Planning repository commit: `cb32886`
- Created: `2026-10-02T19:23:01.019Z`

The retained-only plan contains the governed 25-source roster, four baseline/geographic inputs, four previously selected childcare inputs, retained childcare, Minnesota credential reporting, and the retained CMS hospital and nursing-home directory cohorts. It has eight sequential build/verify stages, zero acquisition stages, and zero network stages.

The immutable index release `zip-active-evidence-index-9eec9bff35e6abbad453fcfdac14aba3fcebb4f578bbbfcf9abc6faf136bb27b` binds all 48,194 source-reported ZIP members and 1,397,626 source/ZIP qualification rows. Its manifest SHA-256 is `046780ab2f0fb3532360c631d06300a8153469dd58d48f5dbae556be65b7d040`. Full native verification reconciled every source shard and index range. There is no index or qualification `current.json`.

The authenticated read-only endpoint now retrieves one ZIP through the registered index, hashes only the bounded referenced shards, enforces the authored 30-source taxonomy, and rechecks current coverage/registry compatibility. It never builds or scans the national release during a request. ZIP Economy shows source evidence review qualification with separate observed and eligible count units, dated review status, restrictive policy, and null current-operation/all-business completeness claims.

The business-segment selector now includes childcare, licensed-business evidence, and registrations/nonprofits. Census aggregate context is deliberately not a business segment. Live ZIP 00501 acceptance returned four childcare, six licensed-business, and nine registrations/nonprofit qualification rows; unsupported and absent scopes remain unavailable rather than zero.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 235,073,126,400 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

Repository verification includes 2,916 tests: 2,845 passed, 71 skipped, and zero failed. Lint, builds, desktop smoke, dependency audit, shutdown, relaunch, health, and single-listener checks passed. Live acceptance verified browser preflight and bearer GET, mounted native category selection, stale-request cancellation, ordinary ZIP evidence independence, keyboard access and 200% text size, with zero page errors and no unexpected writes. Production pointers remained unchanged.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 84 and every earlier CMS directory plan or approval are superseded. No source acquisition, network request, CMS production execution, or production pointer change occurred while preparing Plan 85.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261002-85 --expected-plan-sha256 aa1b1bf868fa56b65f776f8e886666cdbe543dc683b73b97a2d9c633413f8084
```
