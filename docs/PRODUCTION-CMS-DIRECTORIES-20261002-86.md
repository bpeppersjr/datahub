# Proposed additive CMS directory production — October 2, 2026

Plan 86 is the current clean-repository successor after committing the two pointer-free ordinary ZIP-inspector indexes, their exact metadata registrations, bounded runtime selection, ZIP geography presentation, and associated tests.

- Run ID: `production-cms-directories-20261002-86`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261002-86.json`
- Exact confirmation SHA-256: `121cb0b3a39fcd7435bfa6d1e6243bc13e823c41c95817502b0ee3e94aa29f14`
- Plan file SHA-256: `ef302b8a4b77a4b5775731e543bce0943010ae7a3a1b95a78339a23f59474e71`
- Planning repository commit: `240b032`
- Created: `2026-10-02T20:29:57.584Z`

The retained-only plan contains the governed 25-source roster, four baseline/geographic inputs, four previously selected childcare inputs, retained childcare, Minnesota credential reporting, and retained CMS hospital and nursing-home directory cohorts. It has eight sequential build/verify stages, zero acquisition stages, and zero network stages.

The registry ZIP-quality index release `registry-zip-quality-index-4b454f2383f5932e9cb89734e2c120ed7ec85276cc43f5e8fa65409583d4e430` binds all 48,194 selected registry ZIP rows to the 503,302,423-byte source artifact. Its manifest SHA-256 is `1ecbc4cb23d59e584d4528a4f65c23ed9fe4f658e134864416731fc48130941c`.

The coverage ZIP-view index release `coverage-zip-view-index-84ab1aff4d30eb285f59f21f20a8c06f6cef7b529a88b1a7ac4672c2adc09dce` binds all 48,194 selected coverage ZIP rows to the 712,218,883-byte source artifact. Its manifest SHA-256 is `a10a0ae018d76b3923e7f2a788cfb7611e2c5a8616cf49fc93ea26bcae217b6e`.

Both indexes were fully reconstructed and independently verified before registration. Their tracked registrations preserve exact manifests, inventories, source bindings, restrictive policy, clocks and counts without a runtime `current.json`, production enrollment, national-denominator enrollment, source acquisition or production-pointer change.

The authenticated ordinary ZIP inspector now resolves its registry quality and coverage base through exact positional reads. It fails closed on missing or incompatible registrations and does not fall back to a whole-registry audit, coverage scan, discovery or rebuild. It rechecks selected metadata and source identities after auxiliary reads. Existing auxiliary blocks remain separate and non-additive; legacy loaders that do not cooperatively cancel are bounded by the 120-second HTTP response deadline but are not represented as individually cancellable.

ZIP Economy now presents shared registry classification, selected coverage status, same-code governed ZCTA membership/GEOID, selected coverage ZCTA and spatial status, county intersection/assignment evidence, proof gaps, and the correct USPS evidence status. Source-reported ZIP5, Census ZCTA, and current USPS operation remain separate; ZIP4 remains a separate non-geometric field. GDP and demographic allocations remain unavailable until a governed model and inputs exist.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 234,989,285,376 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

Focused verification passed 49 checks with one optional native check skipped, and the installed native bounded check then passed independently. The full four-way repository run executed 2,955 tests: 2,880 passed, 74 skipped, and one unrelated EPA symlink-race assertion failed under load; that exact test passed when rerun alone. Lint completed with four pre-existing warnings and no errors; web and desktop builds, desktop control-plane smoke, 100%/200% keyboard UI acceptance, production dependency audit, shutdown, relaunch, health, and single-listener checks passed. The broader development dependency audit reports seven high-severity transitive advisories in build tooling; no forced dependency-range upgrade was folded into this feature commit.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and confirmation SHA-256. Plan 85 and every earlier CMS directory plan or approval are superseded. No source acquisition, network request, CMS production execution, or production pointer change occurred while preparing Plan 86.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261002-86 --expected-plan-sha256 121cb0b3a39fcd7435bfa6d1e6243bc13e823c41c95817502b0ee3e94aa29f14
```
