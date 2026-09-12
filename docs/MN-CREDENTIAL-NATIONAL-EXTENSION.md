# Minnesota credential extension for registry and coverage

Latest status (September 11, 2026): approved production run `production-mn-credentials-20260910-01` **SUCCEEDED** at `2026-09-11T04:11:14.995Z`, with all eight stages successful and exit code zero. Four national production pointers were updated and independently matched to the receipt. No acquisition was performed. The exact state-consumer reassessment below preserves prior business evidence and restrictions. The preparation/validation paragraphs retain historical context; execution is no longer pending.

The separately versioned registry and national/state/reported-ZIP extension reuses the verified Minnesota residential credential cohort. Its initial code increment did not promote production; the subsequently approved run did. Neither action acquires data, merges licenses into business identities or establishes complete construction-industry coverage.

## Completed production and exact state reassessment — September 11, 2026

The immutable receipt is `data/reconciliations/production-runs/production-mn-credentials-20260910-01/receipt.json`, SHA-256 `b4e594d2b74058e6519e0e88ca5272247bd87c29c14312940713ade97ffcc3c5`. Independent review matched all eight stage logs' bytes/hashes and all four output pointers/manifests to the receipt.

Current coverage is `national-business-coverage-views-20260911-040908332Z-f01c882a`, manifest SHA-256 `f15d43dda3acfb2e81fe2cd0360ec8dfba9f3061597c62c2eb8d1953bdc706b6`; its 56-state artifact SHA-256 is `22783ec56d2e84d6f171b213188e9aead7be8f717869b9e5716713df46125c0c`. The reviewed predecessor is `national-business-coverage-views-20260910-150931456Z-e22ce20b`, manifest `74caa4757947b5d3e6457775f7d067594398325d8be9b1de3dd6298579df817b`, states `6773f956fc7e578d41f49ee1c2ede3cc3b65c73d885b2888cc5e953b30a86238`.

All 56 state rows differ only in three rebuilt lineage IDs and the added credential metric. Every prior business field and full readiness assessment is unchanged. Source replay independently reconciled all credential metrics: 11,456 rows, 10,899 reporting MN addresses and 557 other-state rows; 34 jurisdictions have rows, 22 have zero observed rows in this cohort. The single missing ZIP is in WI. Zero cohort observations do not establish absence of businesses. Existing modeled entity/site counts are unchanged, and the profile-geography summary is byte-identical. The added credential gap increases gap views from 28,085 to 28,086; it does not resolve an existing gap. Shared view export policies tightened from `internal` to `local-review-only` and remain restricted.

`mn-credential-state-reassessment.mjs` checks the complete canonical fingerprint of the independently replayed metric objects and exact whole-row equality except the three pinned lineage replacements. `state-coverage-reassessment.mjs` binds both releases, state artifacts and the production receipt. It carries the original WeakMap-bound historical eligibility through the reviewed predecessor; no source scope, hold, authorization or business/site counter is broadened. Arbitrary future releases, guessed coordinates, policy weakening, category/count drift and unrelated fields fail closed. Reading the overview checks retained proof; it does not replay the source chain again (`sourceReplayThisRead:false`).

Focused verification: 15 reassessment tests passed with zero failures, including all earlier transitions, unchanged eligibility/readiness, credential drift and future-release rejection. Full repository/runtime validation of this consumer change is coordinated separately by the integrator; this focused result is not a full-check or launcher claim.

## Fixed source selection

`config/mn-credential-registry-selection.json` pins the immutable credential reporting manifest `data/credential-reporting/mn-construction/30cd9c0e-0a8d-467c-b416-150453e1513f/manifest.json` by SHA-256 `558182417940580140fbc4640e80ac177b6a9c1886a435f06ae8130b1f258b75`. It is an explicit selection, not a new acquisition or authorization. Neither a current pointer nor whichever release happens to be installed is an acceptable substitute.

`loadMnCredentialRegistryInput` verifies the full original app/acquisition/reporting chain, consumes the bounded credential artifact, checks its exact hash/bytes/count and re-verifies the source and selection afterward. It preserves all 11,456 existing reporting envelopes, including repeated credential numbers, their release-scoped row identities, original observation times, unparsed source dates and historical claims. The loader caps input at 150 MB and 250,000 rows; it is bounded in-memory processing, not an unlimited streaming national loader or an allocated RAM budget.

## Registry boundary

The optional `mnCredentialSelection` builder input and `--mn-credential-selection` registry CLI flag opt into this extension. The caller must also select the registry's usual baseline inputs and output scope. Do not invoke a default production build merely to test this flag. Production execution is limited to the separately approved completed run above; no rerun is needed for this consumer transition.

The registry writes `reporting/mn-construction/credentials.jsonl` as `mn-construction-credential-reporting-jsonl`, with `local-review-only` policy. `mn_construction_credential_reporting` binds the selection, source manifest, original app receipt and exact reporting summary. A distinct dependency identifies the retained credential release. `coverage.mn_construction_credential_rows` is separate from legacy `source_records`; no new composite total is presented as a business count.

The rows do not enter canonical organizations, physical sites, establishments, identity assertions, relationships or matching/location profiles. Original credential envelopes still contain their historical `national_reporting_integrated:false` claims; source history is not rewritten when a downstream extension is built. Extension presence identifies downstream inclusion, not retroactive source authorization or independently verified business operations.

The independent registry verifier runs for historical and extended manifests. Without a declaration, it rejects a reserved artifact path or type, dependency or credential count. With a declaration, it replays every source row, rejects duplicate dependencies and requires the exact restricted artifact policy. A relabeled reserved path cannot bypass the verifier. Registry processing time cannot precede the selected retained release.

## Coverage and percentage semantics

The coverage builder propagates the extension automatically from an explicitly extended registry. Credential metrics are separate fields, never additions to physical-site or matching totals.

- `registry-union` counts every row in the selected credential cohort.
- `50-states-and-dc` counts rows whose reported address state is one of those 51 jurisdictions.
- `all-census-us-areas` counts rows reporting a state-equivalent present in the selected Census state views. Publisher jurisdiction is never substituted for a missing reported address state.
- State and ZIP metrics group the reported fields. Unknown states and ZIPs absent from existing views are counted explicitly in the declaration rather than silently dropped.
- County credential counts are null: this source supplies no geocodes or governed county membership. Joining a ZIP does not establish ZCTA or county assignment.

The full retained source cohort is the denominator for `percent_of_selected_credential_cohort` and category share across that cohort. Category share within a selected geographic cohort uses that cohort's credential-row total. Zero denominators produce null. These percentages are not estimates of all U.S. construction businesses, and national completeness, unique-business and active-business counts remain null.

The retained dataset contains 10,899 MN-reported-address rows and 557 other-state rows. One ZIP5 is unavailable. ZIP5 and ZIP4 remain separate; coordinates remain null. Names, addresses, credential status and source dates remain publisher assertions, not verified physical premises, present operation, ownership or business lifecycle dates.

Coverage retains a checksum-bound internal registry manifest copy and independently replays the credential input and derived metrics. It checks copy policy/bytes/count, the exact registry dependency, restricted view policies and chronology. When childcare and credentials share an output, all view artifacts take the stricter `local-review-only` policy; the childcare verifier accepts this specific intersection without widening historical output rules. Missing declarations and dropped extensions are rejected.

## Verification, rollout and remaining work

Tests cover explicit selection, orphan/relabelled artifacts, repeated credentials, missing ZIPs, outside-state scope, zero denominators, exact source replay, mutated fields/policies/counts, processing chronology and legacy count preservation. Native builder tests use local isolated fixtures and the real retained credential input, not production pointers.

Validation on September 10, 2026: `npm run check` completed successfully with 1,857 tests (1,846 passed, 11 skipped, zero failures), lint, web/desktop builds and desktop control-plane smoke. The retained-data gates were enabled, including the new 11,456-row offline replay and combined Minnesota/childcare coverage test. Full evidence is retained in `data/tmp/mn-credential-national-extension-full-check.log`. Focused native registry and coverage checks also passed; TypeScript passed and `npm audit --omit=dev` reported zero vulnerabilities. No browser visual QA is claimed.

Production-planner follow-up is implemented, validated and used by the completed approved run: `plan --mn-credential-selection <selection.json>` uses a separate evidence pin, reconstructs the selection at execution, checks retained files before and after each stage, and requires the credential dependency in registry output. It coexists with retained childcare and rejects either historical recovery mode before readiness inspection. The real 16-file helper replay, CLI rejection tests and isolated Minnesota-only/combined eight-stage controller tests passed; the complete planner validation rerun passed 1,852 tests with 11 skips and zero failures. Flat-file export and map/UI consumers must still explicitly adopt the credential evidence type before claiming inclusion. The local credential panel's original source claims remain separate from downstream production status.

### Production handoff contract

A read-only dependency audit identified 16 consumed local evidence/config files. The production pin helper must first replay `loadMnCredentialRegistryInput`, derive this linked roster, pin raw file SHA-256 and bytes, then replay again to detect changes. JSON-semantic enrollment/policy hashes are not substitutes for file-byte hashes.

- Three configuration files: the registry selection, `config/mn-construction-app-enrollment.json`, and `config/source-policies/mn-construction-internal-acquisition.json`.
- Two selected credential-release files: `manifest.json` and `credentials.jsonl`.
- Eleven files within original job `ebfad910-440e-46bb-b42b-2fc44b6d32f3`: `start.json`, `receipt.json`, `acquisition-checkpoint.json`, `notices-before.json`, `schema-preflight.json`, `publisher-wait.json`, acquisition receipt `acquisitions/c1135a10-c551-4f23-a260-7f132721be43.json`, and the four selected-release files (`manifest.json`, `selected.jsonl`, `selection-receipt.json`, `normalized.jsonl`) within `selected/fcbfe10a-745b-4f8f-96e3-56116414f77f`.

The acquisition receipt embeds after-notices; there is no separate after-notices file. Preserve the verified roster, including optional publisher-wait evidence where present. Do not recursively include unrelated acquisition trees, failed registrations, parent industry receipts, current pointers, live locks, or unconsumed enrollment configurations. No raw CSV reacquisition is needed.

The production implementation must keep Minnesota and retained childcare selections independent, allow their flags together on the registry stage, and deduplicate/sort implementation pins when either extension is present. Bind Minnesota evidence in pre/post-stage pin checks, plan reconstruction and expected registry dependencies. Both historical recovery modes must reject a newly added Minnesota selection; absent selection must preserve historical plan behavior. If dependency-version reproducibility is claimed, explicitly pin `package.json` and the lockfile as well as the imported verifier chain (selected-row replay uses `csv-parse`). These are implementation acceptance requirements, not an already prepared or approved production plan.

### Successor-plan preparation and validation history

Native planning completed for `production-mn-credentials-20260910-01`, SHA-256 `f082d6f3b69a16e28881f368c6607cf9463c2177ca65b1bb1e50127f9f4969c5`, stored under `data/reconciliations/production-plans/`. It contains 25 base sources, four optional source bindings, seven retained childcare bindings, all 11,456 Minnesota credential rows, 16 Minnesota evidence pins and eight stages with `national-12g`. Comparison confirmed the entire optional-source and retained-childcare pin objects were unchanged. It was subsequently approved and executed successfully as recorded above. Planning output remains in `data/tmp/mn-credential-production-plan.log`; do not rewrite or rerun the immutable completed plan.

The completed predecessor `production-childcare-retained-20260910-01` remains immutable. Its completed successor preserved its four explicit optional source bindings (`maChildcare`, `njChildcare`, recovered `tnChildcare`, and `ohChildcareReceipt`), all seven retained childcare cohorts and `national-12g`, adding only the credential selection. Any future production run requires its own current evidence-bound plan; this reassessment neither prepares nor dispatches one.

The production follow-up's focused checks passed, including exact retained roster replay, early historical-recovery rejection, CLI argument rejection, and the isolated controller's Minnesota-only/combined paths. The combined controller fixture uses one synthetic childcare binding; actual seven-cohort execution is evidenced separately by the completed receipt. Tests reject pre-launch drift, rehashed-plan tampering, incorrect dependencies and changed input during registry build. The subprocess test requires positive assertion output. TypeScript and audit passed. The original full-check attempt is retained in `data/tmp/mn-credential-production-full-check.log`; its successful rerun and later approved production are recorded above.

### Pre-publication comparison baseline

The successor's pinned predecessor registry (`national-business-registry-20260910-132939322Z-176d0af2`) reports 33,992,773 legacy source records, 12,206 retained childcare candidates, and 34,004,979 source records including childcare. It reports 19,247,120 organization rows, 8,025,017 physical-site rows and 8,025,017 establishment rows. These are existing modeled/source counts, not independently verified unique active businesses. The Minnesota extension should leave these legacy counters unchanged and add only its separately named 11,456 credential-row count.

The pinned predecessor coverage has three national views, 3,235 county views and 48,194 ZIP-union views. Of the ZIP views, 47,995 have record-level source contributions and 199 do not; 33,791 have a ZCTA polygon and 14,403 do not. The ZIP union is not an authoritative count of currently valid USPS ZIPs, and absent ZCTA polygons do not authorize invented ZIP geometries. Production comparison must preserve the existing view scopes and contribution counts while verifying the new credential fields and missing-ZIP accounting. It must not relabel these baseline gaps as resolved by credential inclusion.

### Validation rerun

Historical validation follow-up: the first full-check attempt ended with 1,851 passes, 11 skips and one development-supervisor failure reporting an existing vinext process on port 3000. Inspection afterward found that PID and all dev supervisors absent; no process was force-terminated or lock reclaimed. Both supervisor tests then passed (`data/tmp/mn-production-supervisor-recheck.log`). The complete rerun subsequently passed with 1,852 passes, 11 skips and zero failures, plus lint/build/smoke checks (`data/tmp/mn-credential-production-full-check-rerun.log`). The failed first attempt is not a full pass; neither historical attempt is the current production status.

### Consumer implementation boundaries

The original local credential reader and source records retain `nationalReportingIntegrated:false`; those historical claims must not be rewritten. An extended national release now exists as evidenced above. Consumer inclusion must be represented by separately verified downstream-publication status bound to the selected credential manifest and exact registry/coverage releases, not inferred from source flags, code presence or an unverified pointer. Broader map/export consumer adoption is outside this state-reassessment change.

The heatmap's existing retained county layer is for PA/MD childcare source points. Minnesota credentials have no coordinates or governed county/ZCTA membership, so this layer cannot render them as assigned points. Any credential view must use reported-state/reported-ZIP groups, retain missing-ZIP visibility, label cohort denominators explicitly, and leave county/point values unavailable. Flat-file support must explicitly select the credential artifact type and enforce its local-review-only policy; it must not route credentials through location profiles or silently omit restrictions. These consumer changes are not implemented by the production-planner increment.

The local preview was restored after the successful production-planner validation rerun, and an HTTP GET to `http://localhost:3000/` returned 200. Refresh scheduler ownership was not changed or reclaimed. No browser visual QA is claimed.

Rollback of this consumer reassessment removes its explicit reviewed transition/helper; the overview will then fail closed for the current release until reviewed again. Preserve all source evidence, completed plans, receipts and production releases. Do not roll back production pointers or rerun the completed plan as part of a consumer rollback. No acquisition, schedule or pointer is changed by the reassessment itself.
