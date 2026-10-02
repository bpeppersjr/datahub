# Proposed additive CMS directory production — October 2, 2026

Plan 79 is the current clean-repository successor after source-bound replay verification was added for the retained entity-resolution benchmark.

- Run ID: `production-cms-directories-20261002-79`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261002-79.json`
- Exact confirmation SHA-256: `3817aca45ad37f8abfbb01b1f4238acb67e5fe8384ababc6f7e7ab5043589049`
- Plan file SHA-256: `a75ae848383766cbed6defa2a9136a6dddf0e1cc5d13cec3eb90d647d4ede071`
- Planning repository commit: `f6025c82bb376ebb43e94c28387f77d72cfd3ed9`
- Benchmark replay implementation commit: `f6025c82bb376ebb43e94c28387f77d72cfd3ed9`
- Created: `2026-10-02T12:59:47.109Z`

The retained-only plan contains the governed 25-source roster, four baseline/geographic inputs, four previously selected childcare inputs, retained childcare, Minnesota credential reporting, and the retained CMS hospital and nursing-home directory cohorts. It has eight sequential build/verify stages, zero acquisition stages, and zero network stages.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 238,958,272,512 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

The retained benchmark replay passed against exact benchmark, resolution, and registry manifest snapshots. It reconstructed candidate universes of 1,449,108 automatic physical-site pairs, 74,738 automatic establishment pairs, and 106,063 review candidates; reproduced the 425 minimum-hash samples in each stratum; and exactly matched 1,275 enriched candidates containing 2,545 unique profiles. The proof remains `awaiting-independent-labels`: zero labels were submitted, the precision gate is false, and export is not authorized.

The verifier uses bounded, cancellable artifact readers, exact consumed-manifest hashes, complete generated-row identity checks, current publisher-2.15 reporting evidence, and full-record replay. Repository verification includes 2,835 tests: 2,766 passed, 69 skipped, and zero failed. Lint, web build, desktop build, desktop control-plane, and dependency audit passed. The required stop/relaunch sequence completed, `/api/health` returned `ok`, and exactly one loopback listener remained.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 78 and every earlier CMS directory plan or approval are superseded. No source acquisition, network request, production execution, production pointer change, or governed evidence rebuild occurred while preparing Plan 79.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261002-79 --expected-plan-sha256 3817aca45ad37f8abfbb01b1f4238acb67e5fe8384ababc6f7e7ab5043589049
```
