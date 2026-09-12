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

## Historical helper-only handoff

After shared-file ownership is assigned, planner/CLI work must add one optional nursing selection to plan mode only, pin/reconstruct its exact declaration, recheck source and implementation before/after stages, forward it exactly once to the registry builder, validate the emitted dependency/full declaration, and reject historical recovery modes that omitted this source. Test absence compatibility, nursing-only, hospital+nursing and MN+nursing co-selection, distinct fingerprints, either-source drift and declaration omission. Preserve independent hospital coverage work; do not label unchanged legacy coverage as nursing coverage. No production dispatch should precede those contracts/tests and root review.

Coordination note: root reports main hospital coverage implementation at `a915f08`; the hospital production helper's earlier `coverageProjectionImplemented:false` now needs a separately coordinated planner/status correction after the frozen check. That is an implementation-status issue, not evidence of a production coverage release. This slice does not edit that helper or shared planner. Nursing coverage remains absent.

## Subsequent isolated planner and CLI implementation

The separately reviewed hospital planner dependency `3768fee` was applied cleanly as `802801a` after helper commit `0361908`. The next isolated change adds `cmsNursingHomeSelection` to fresh planning and `--cms-nursing-home-selection` to the production-plan and registry-build CLIs. Stored-plan run/stop cannot add it; both historical recovery modes reject it. Plan fingerprints include its exact fifteen evidence pins and deduplicated implementation inventory. Run reconstructs the selected declaration, rechecks evidence/implementation at stage boundaries, forwards the selection once to registry build, and rejects missing or changed nursing declarations/dependencies. Co-selected hospital and Minnesota declarations are also checked. Nursing coverage remains a separate, unimplemented integration; no production release is claimed.

A fresh plan does **not** inherit previous optional inputs. The existing `production-mn-credentials-20260910-01` selected MA, NJ, recovered TN, an OH receipt, retained childcare and Minnesota credentials. A later additive CMS candidate must explicitly repeat their previously verified exact paths, plus both CMS selections, for example:

```text
plan --ma-childcare <prior-exact-MA-manifest> --nj-childcare <prior-exact-NJ-manifest> --tn-childcare <prior-exact-recovered-TN-manifest> --oh-childcare-receipt <prior-exact-OH-receipt> --retained-childcare-selection <prior-exact-selection> --mn-credential-selection <prior-exact-MN-selection> --cms-hospital-selection config/cms-hospital-retained-selection.json --cms-nursing-home-selection config/cms-nursing-home-retained-selection.json
```

Placeholders deliberately do not create an executable dispatch command or inherit historical approval. Do not silently fill options or rewrite an old plan. The later full-cohort candidate must prove every retained declaration before approval. No production plan/run, pointer change or source request was performed in this slice.

Focused planner verification: eight distinct named tests pass, including unchanged 25-source legacy planning, nursing-only, nursing+Minnesota, nursing+hospital, existing hospital cases, triple nursing+hospital+Minnesota selection (each missing/altered declaration or missing dependency rejects), and malformed/non-plan CLI arguments. Controller fixtures mock only the source-pin utility, build tiny isolated outputs, and test prelaunch/midstage drift, rehashed plan tampering, missing dependencies, altered declarations, unique fingerprints and successful eight-stage orchestration. They do not attest a real production registry or coverage release. Native fifteen-pin verification belongs to the separately tested helper above. Four changed implementation/test files pass ESLint; diff whitespace check passes. Full application validation remains the integrator's boundary.
