# Nursing-home production input helper: isolated preparatory slice

Only `runner/cms-nursing-home-production-input.mjs`, its test and this note are new. No shared registry, production controller, CLI, coverage, output pointer or source file is changed by this slice. This is not a production plan, run or dispatch.

`pinCmsNursingHomeProductionInput(root, selection, {safe,fileHash,signal?})` follows the hospital planner utility seam. Root must resolve to APP_ROOT; selection still resolves through the exact native nursing registry loader. The planner-supplied safe-path/hash utilities are trusted local infrastructure, not user-defined source overrides. Unknown/accessor options reject. The helper performs native retained recovery/source replay before and after pinning, compares exact declarations and both directory rosters, then rechecks every hash and roster before returning.

Exactly 15 evidence pins are emitted in sorted order:

- Fixed nursing selection config.
- Recovery manifest and selected JSONL for `9fe3aa54-dd38-42be-b28e-b1d363300a45`.
- All twelve original failed-source files for `ffb1fac4-4eb4-4ea4-b11c-875ebff4de41`, including failure/intent, five request intents, before/after metadata, dictionary, reuse notice and raw CSV.

Hashes from the callback must match the already independently verified declaration. Known artifact byte sizes must match exactly; selection/manifest have small explicit bounds. The native source/recovery readers independently enforce their existing stable, single-link, bounded-read contracts. No alternate job, generic failed-run bypass, copy, download or recovery is performed.

Returned scope is `typed-registry-nursing-home-directory-rows-only`, source mode `retained-native-source-recovery`, registry admission implemented, nursing coverage projection unimplemented, production release unverified and production dispatch false. Implementation presence is not proof of a projected production release. The declaration retains all 14,690 directory rows, twelve original-source pins, recovery lineage/clock, TAB/source status/coordinate semantics and not-yet-reconciled claims. It cannot be treated as a business/site-count or coverage release.

`cmsNursingHomeImplementationFiles` uses the existing conservative retained-source inventory: runner/scripts/config implementation files plus package.json/package-lock.json, sorted and deduplicated. This covers dynamic/transitive imports, including recovery pins and policy. Inventory observed 1,142 files in this isolated revision; this is not a permanent expected count or proof that all modules have been hashed. A future planner must hash the returned inventory and deduplicate it with co-selected source inventories. No inventory shape for absent nursing inputs changes here.

Three focused tests pass with networking forbidden. Actual retained validation produced all 15 pins and 14,690 rows without plan creation; wrong native roots/closed options/accessors/pre-abort reject; incorrect initial hashes, changed final hashes and mid-pin cancellation reject. Existing source files were never mutated. Key pins remain recovery manifest `89ee608067aa5b97833957b753be61003dc2efcfa22cfaedbb3b78f020396d7e`, selected JSONL `677b1dc7b294f72feb0d6a0803d27c9f0f074887e5b9c5a59a6837c87a2320d8`, failed receipt `1cece3c9e809fc8ffa4bc271ee5472f62c66a1a2780825511f474c557132d1a7`. Owned-file lint passes.

## Coordinated follow-on, not implemented here

After shared-file ownership is assigned, planner/CLI work must add one optional nursing selection to plan mode only, pin/reconstruct its exact declaration, recheck source and implementation before/after stages, forward it exactly once to the registry builder, validate the emitted dependency/full declaration, and reject historical recovery modes that omitted this source. Test absence compatibility, nursing-only, hospital+nursing and MN+nursing co-selection, distinct fingerprints, either-source drift and declaration omission. Preserve independent hospital coverage work; do not label unchanged legacy coverage as nursing coverage. No production dispatch should precede those contracts/tests and root review.

Coordination note: root reports main hospital coverage implementation at `a915f08`; the hospital production helper's earlier `coverageProjectionImplemented:false` now needs a separately coordinated planner/status correction after the frozen check. That is an implementation-status issue, not evidence of a production coverage release. This slice does not edit that helper or shared planner. Nursing coverage remains absent.
