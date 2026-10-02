# Proposed additive CMS directory production — October 2, 2026

Plan 78 is the current clean-repository successor after the national registry catalog and documentation were reconciled to the retained publisher-2.15 release.

- Run ID: `production-cms-directories-20261002-78`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261002-78.json`
- Exact confirmation SHA-256: `cbfb5a24a647fc1bf774a2966132112161441a90ff29d038bdda9c0514be5977`
- Plan file SHA-256: `bc25ad3275b1fd17901311230927dcd0a8d5131befc15b554fc355ce1830301e`
- Planning repository commit: `bc073b2e031f07f5c879c35e3efc3d2d524ee0d5`
- Registry catalog reconciliation commit: `bc073b2e031f07f5c879c35e3efc3d2d524ee0d5`
- Created: `2026-10-02T12:05:09.307Z`

The retained-only plan contains the governed 25-source roster, four baseline/geographic inputs, four previously selected childcare inputs, retained childcare, Minnesota credential reporting, and the retained CMS hospital and nursing-home directory cohorts. It has eight sequential build/verify stages, zero acquisition stages, and zero network stages.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 239,010,140,160 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

The national registry catalog now binds to retained release `national-business-registry-20260911-022652067Z-1ec656c3`, publisher 2.15.0, and manifest SHA-256 `d8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76`. Its headline totals, ZIP counts, artifact count, artifact bytes, and identity-profile scope are checked against the immutable manifest. Detailed source-specific metrics remain authoritative only in that manifest, avoiding a second drifting copy.

The full retained registry verifier passed across 695 artifacts totaling 12,132,804,096 bytes. Repository verification includes 2,832 tests: 2,763 passed, 69 skipped, and zero failed. Lint, web build, desktop build, desktop control-plane, and dependency audit passed. The required stop/relaunch sequence completed, `/api/health` returned `ok`, and exactly one loopback listener remained.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 77 and every earlier CMS directory plan or approval are superseded. No source acquisition, network request, production execution, production pointer change, or governed evidence rebuild occurred while preparing Plan 78.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261002-78 --expected-plan-sha256 cbfb5a24a647fc1bf774a2966132112161441a90ff29d038bdda9c0514be5977
```
