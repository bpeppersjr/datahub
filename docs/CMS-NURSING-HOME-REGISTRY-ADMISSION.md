# Optional nursing-home directory registry admission

This isolated slice adds typed retained reporting to the registry, not a production release, new source acquisition, identity matching, planner wiring or coverage migration. Before editing the registry, reviewed main hospital dependency commits `13dabda`, `26b8f43`, `672e42c`, `e2f8880` were cherry-picked without conflict as `bca25cb`, `53cbc6d`, `b9d74c1`, `fb07f16`. Local nursing-home history was preserved. Integrate only the nursing diff; do not overwrite newer main files or replay these dependency commits unnecessarily.

New `runner/cms-nursing-home-registry-input.mjs` consumes the fixed recovered reporting loader. Its declaration binds selection hash, recovery UUID/manifest, exact 14,690-row selected hash, full twelve-file original failed-source lineage, projection version, and separate observation/failure/recovery clocks. Registry creation cannot precede recovery creation. Native admission replays the complete source chain and verifies ordered source-identical artifact membership; it does not accept fixture loaders or arbitrary recovered cohorts.

`buildNationalBusinessRegistry` accepts optional `cmsNursingHomeSelection`, default null. With the option absent, all existing base-version choices and source prerequisites remain unchanged. With it present, explicit supported base versions remain 2.12–2.15, without requiring unrelated Ohio/Tennessee inputs. The hospital extension remains intact and can be co-selected independently.

Closed nursing fields:

- Artifact `reporting/cms-nursing-homes/directory.jsonl`, type `cms-nursing-home-directory-reporting-jsonl`, local-review-only.
- Dependency `cms-nursing-home-provider-information`, identifying the pinned recovery release, not a fabricated successful acquisition.
- Declaration `cms_nursing_home_directory_reporting`.
- Separate count `coverage.cms_nursing_home_directory_rows`.

Directory rows are explicitly `not-yet-reconciled`: no generic business/site/establishment/source-record/resolution-profile counts increase. A future identity crosswalk requires its own evidence-backed migration. The source-active dated assertion, original address/TAB annotation, separate ZIPs, raw coordinate quality and zero facility-point eligibility remain verbatim. No county or NPI inference is introduced.

Verification imports the nursing dependency closure only when a reserved declaration, artifact path/type, dependency, count or actual file is present. Undeclared physical files cannot bypass verification; absent legacy fixtures do not need nursing/hospital modules. Exact source/artifact/declaration equality, chronology, membership and policy are enforced. Both nursing and hospital wrappers now perform a final bounded artifact hash/identity reread after source replay, plus directory identity checks, so source rechecking cannot hide intervening output mutation. No native test hook was added. The inherited full builder has no top-level cancellation signal; this slice does not invent one. Direct wrapper/verifier APIs forward supplied signals into retained replay.

## Evidence

Eight nursing admission fixtures, eight hospital admission regressions and ten nursing reporting fixtures pass; owned-file ESLint passes. They cover orphan/missing/duplicate declarations, dependency and failed-source pin drift, unsupported versions, chronology, policy widening, complete ordered membership, sparse rows and pre-abort.

Root authorized the actual tiny-SNAP builder/full-verifier fixture. The already verified hospital job was copied byte-identically, exclusive/no-overwrite, from main into the isolated absent source path and independently verified (12 files, 5,419 rows); no fetch. Existing nursing recovery was reused without copying/recovery. With global network disabled, the fixture built baseline, nursing-only, and hospital+nursing registries under isolated `data/tmp`, then cleaned their temporary output/pointers. Both admitted cases passed full verification on base 2.12. Every legacy coverage count and all 100 resolution-profile artifact hashes/counts stayed identical. Nursing retained exact selected SHA256 `677b1dc7b294f72feb0d6a0803d27c9f0f074887e5b9c5a59a6837c87a2320d8`; combined admission also retained hospital selected SHA256 `30cb62fac6c3c9a52e9cdba31423a138b65945beb8321cb48f3825f8506bb979`.

Both cases rejected an undeclared physical nursing artifact and a rehashed altered TAB-quality record. Both wrappers also rejected output mutation during genuine retained-source rechecking, using test-only builtin interception on fixture output files. A separate baseline child process denied both CMS import closures yet verified successfully. Final aggregate proof: isolated `data/tmp/nursing-registry-proof-cc052ce5-3ce8-4317-9593-b947b5e5dc8d.json` (actual fixture passed in 29.5 seconds). This was a bounded fixture, not production-scale processing or a production pointer update.

Next, separately version planner/CLI source pinning and stage recovery before production dispatch; preserve all original failed-source/recovery dependencies. Coverage and UI consumption require distinct typed directory metrics and fixed denominators, not fake business totals. No planner or coverage file was edited here.
