# Ohio collection handed to Co*Tive

At **2026-09-08T07:48:42.742Z**, the authenticated local managed-collection endpoint accepted one Childcare/OH task with HTTP 202.

- Operation ID: `0a4175ed-81ed-4ed9-a846-44a972c8ba9c`
- Source task: `state-oh-childcare:OH`
- Fixed entry: `scripts/build-oh-childcare.mjs`
- Implementation commit: `1037935`
- Persisted managed receipt: `data/managed-operations/0a4175ed-81ed-4ed9-a846-44a972c8ba9c/receipt.json`
- Receipt status at acceptance observation: `RUNNING`
- Observed receipt SHA-256: `6fccf4acec1a26dfcc7615bc0f518d5398ccc0045564e9f59343a9f81f72e443`

The managed receipt is mutable while the app advances the operation. This hash identifies only the acceptance-time observation, not a terminal receipt or an immutable completed release. The pre-dispatch plan contained exactly one Ohio task and no earlier Ohio managed collection operation. No retained live Ohio facility release was available for reuse; synthetic test runs are not publisher acquisitions.

The application, not a Codex shell download process, owns execution through the managed industry worker. Its canonical industry receipt will be under `data/industry-segments/runs/<operation-id>/receipt.json`; the Ohio output is in that run's `state-oh-childcare-OH` folder. Its own start, acquisition checkpoint and terminal receipts link immutable releases. Fresh source-use gates still run in the worker and can fail before facility acquisition.

No agent slot or Codex polling loop is assigned to ordinary download progress. Use the app's Data Operations view for status. This handoff does **not** prove successful acquisition, a record count, national integration, public export permission, complete Ohio industry coverage or recurring scheduling. No schedule was enabled and no national production pointer changed.

Implementation verification before dispatch: 925 passing repository tests, source/connector checks, lint, web/desktop builds, desktop smoke and a zero-vulnerability production dependency audit. Independent read-only review confirmed the final receipt and dependency-linkage fixes. The management app was restored and returned HTTP 200 before dispatch.

Continue independent state/source validation while Co*Tive owns this job. If the job produces a completed verified release, downstream work must reuse it. Investigate concrete failures from its retained evidence; do not automatically reacquire or reinterpret an interrupted download as completed.

## Terminal failure found during development lifecycle safety check

Before stopping development services for Alaska validation, the persisted operation receipt was checked to avoid interrupting app-owned work. It records `FAILED`, finished `2026-09-08T07:49:00.672Z`. A bounded read-only peer inspection found that source-use prerequisites passed and an inventory of 4,237 IDs was retained, but the first feature batch failed `Ohio acquisition rejected: batch envelope, CRS or truncation.` No completed acquisition or normalized release exists from this operation; no blocking acquisition/app lock remains.

The rejected response was not retained, so the local evidence cannot distinguish the individual structural checks within that error. Metadata, IDs and a rejected batch were downloaded; this is not a zero-download failure. The next connector repair is privacy-safe structural diagnostics followed by a separately controlled bounded diagnostic, not a blind collection retry. No new acquisition was dispatched during this inspection.

## Corrected connector handoff — 08:18 UTC

After the envelope and query-field metadata repairs (`6aabfe5`, `77ddd5b`), a retained first-page diagnostic independently validated 100 selected records. Full checks passed 934 tests, lint, builds and desktop smoke; the production dependency audit found zero vulnerabilities. No completed acquisition was present in the original failed operation or the default Ohio source location. The original terminal failed receipt was explicitly recognized without deleting or changing it; any other existing Ohio operation still blocks this dispatch helper.

The managed collection API accepted exactly one Ohio childcare task with HTTP 202:

- Operation: `7d93702e-1558-48c0-8676-c77cb40fe05e`.
- Acceptance observed: `2026-09-08T08:18:14.151Z`; persisted status then `QUEUED`.
- Receipt: `data/managed-operations/7d93702e-1558-48c0-8676-c77cb40fe05e/receipt.json`.
- Acceptance-observation receipt SHA-256: `2e9f66b2206737cc9cf44244a9a320b81967ddeaa3d7ea4405b5499118d20816`.

This mutable receipt hash proves only the observed acceptance state, not completion. Co*Tive owns subsequent execution and fresh source-use verification. No Codex progress polling or download supervision follows handoff. No recurring schedule, national promotion or public export was enabled. Use the app's Data Operations view for status; downstream work must reuse a completed verified acquisition rather than repull for promotion.

## Receipt-transition failure found during lifecycle safety check

Before development shutdown for Alaska validation, receipt `7d93702e-1558-48c0-8676-c77cb40fe05e` was still `QUEUED`. A read-only runtime audit found supervisor PID 17316 alive, no child under that supervisor or Ohio acquisition process, and no industry-run directory. Its operation directory also contained `receipt.json.tmp-73ee0487-9d36-4ae3-9635-c3c5d35d401f`, describing the intended `RUNNING` transition at 08:18:14 without a child PID. The code awaits this transition before spawning. This evidence indicates a failed receipt replacement, not a normal scheduling delay; the exact original filesystem error was not retained, so Windows sharing contention remains an inference.

Managed receipt writes now reuse the tested fsynced, exclusive-temporary writer with bounded Windows sharing retries and owned cleanup. A rejected write no longer poisons later writes, and the initial `RUNNING` persist is inside the failure handler: if it fails, no child launches and the app attempts a durable `FAILED` receipt. A deterministic regression checks zero executor calls and matching in-memory/disk terminal failure. This does not guarantee recovery when storage remains unwritable.

The old supervisor was stopped only after the no-child audit. Both old receipt files remain preserved. No automatic replay or replacement collection was requested. Existing startup behavior keeps missing/unresolved child ownership `UNKNOWN` and blocks duplicates; reconciling this historical receipt is separate from repairing future writes. HTTP acceptance was genuine, but it did not prove that the child started or that any Ohio rows were downloaded by this operation.

The repaired runtime passed all 937 repository tests, lint, builds and desktop smoke, plus the zero-vulnerability dependency audit. It was restarted successfully. Rollback reverts the writer integration and transition handling without changing the historical receipts; doing so restores the observed persistence weakness and is not recommended.

## Audited incident recovery and new app handoff — 08:29 UTC

The stale operation `7d93702e-1558-48c0-8676-c77cb40fe05e` was explicitly classified `FAILED` after two independent read-only inspections and a hash-pinned maintenance procedure. The old supervisor was absent, no app/industry/Ohio collection process remained during the exclusive recovery window, and no industry-run directory existed. The exact original queued and pending-running bytes differed only in status/start time; neither recorded a child PID. The audited runtime awaits the running-receipt commit before spawn. This supports a pre-launch persistence-failure classification, not a claim about the exact unrecorded OS error.

Both originals are preserved under `data/managed-operations/7d93702e-1558-48c0-8676-c77cb40fe05e/recovery-prelaunch-20260908/`, alongside the candidate terminal receipt and `decision.json`. The original pending temporary file also remains in place. Original queued SHA-256 is `2e9f66b2206737cc9cf44244a9a320b81967ddeaa3d7ea4405b5499118d20816`; original pending SHA-256 is `03eb80a410c3dc2a31d623098f7ba780101ee0ec17b44484cc6f9150575e5cef`. The recovered terminal receipt SHA-256 is `d3c9359df204fb390afe4a29db531b0484e85d32b190ade7ed41cc13fe2959a1`. No files were deleted, no source data was changed, and recovery made no downloads. Restore only through another audited maintenance decision; blindly restoring the queued snapshot would reintroduce unresolved ownership.

After restart, the app recognized the recovered operation as failed. The new dispatch check allowed only the two specifically inspected historical failures and rejected any other existing Ohio operation. No completed acquisition was found at the default Ohio source location or this failed operation's industry location. This is controlled redispatch following a concrete repair, not automatic retry or re-download for promotion.

The managed collection API then accepted one Ohio childcare task with HTTP 202:

- Operation: `bd35c825-a6d0-4922-8508-7954ce00f5d5`.
- Acceptance observed: `2026-09-08T08:29:58.154Z`; persisted status then `QUEUED`.
- Receipt: `data/managed-operations/bd35c825-a6d0-4922-8508-7954ce00f5d5/receipt.json`.
- Acceptance-observation SHA-256: `a44a098fde28a7b1221b5a1bf1e225fbce022b77ce6bae51986efc05008246eb`.

No agent is retained to poll or supervise ordinary acquisition progress. Acceptance does not prove launch, completion or record counts. Co*Tive owns execution, prerequisite checks and terminal receipts. No national promotion, schedule or public export was enabled. This maintenance turn changed runtime evidence and documentation, not application source; the preceding 937-test validation remains the latest full code check.

## Completed app acquisition independently verified

During the next development lifecycle safety check, operation `bd35c825-a6d0-4922-8508-7954ce00f5d5` was terminal `SUCCEEDED`, finished `2026-09-08T08:31:23.415Z`. The standalone verifier then independently replayed its completed app receipt and both linked releases, without network access:

- App job: `87bc8228-dcf9-4d0f-9921-55ef33bc9a66`, execution mode `fixed-native-fetch`.
- Receipt under `state-oh-childcare-OH/jobs/87bc8228-dcf9-4d0f-9921-55ef33bc9a66/receipt.json`, SHA-256 `753fc3190e4a5ce0306f9a25aba8ad02ad70f0920d1783bca60bc114afb42caa`.
- Acquired release: `oh-acquisition-e7f375dd-a65b-456b-8c1e-37a641d9e6a5`, manifest SHA-256 `0e122461fa4c49f0abb1b7c1a9765f099ff967040536586345e03a1cc1ee9b1a`.
- Normalized release: `oh-childcare-c253c884-2048-47f9-8d7f-5ed29531acee`, manifest SHA-256 `e4de0ed529da81c09522c52b9990b41a1edad1adf906f9eea2b95363ff241171`.
- Selected and accepted records: **4,237**; quarantined: **0**.

All relative locations above are under `data/industry-segments/runs/bd35c825-a6d0-4922-8508-7954ce00f5d5/`. Acquisition and normalization occurred in the standalone application; no Codex polling loop supervised the download. Subsequent integration must reuse these verified immutable releases, not reacquire them for promotion. National reporting integration and public export remain false. Counts describe the publisher's selected Open Child Care Center records, not all childcare, independently verified operating businesses or national completeness.

## Verified national-input boundary

`runner/oh-childcare-registry-input.mjs` adds the read-only `loadOhChildcareRegistryInput(receiptPath, { signal })` boundary. It requires a completed independently verified app receipt, not an unbound normalized manifest. It repeats acquisition/normalization verification, hashes the exact consumed record bytes and rechecks the snapshot after cooperative processing. It performs no network requests or writes.

The returned records preserve original page-level observation times, processing times, typed identifiers, nullable coordinates, separate ZIP5/ZIP4 and missing-data reasons. Counts conserve accepted and quarantined membership. Acquisition receipt and manifest hashes remain separate from the offline normalization policy. Injected test executions stay explicitly labeled; they do not become native acquisition evidence.

The retained native release above was successfully loaded: 4,237 selected and accepted rows, zero quarantine, 4,237 with ZIP5, zero with ZIP4, and no missing-point reasons. Normalized artifact SHA-256: `c20715ea64e5515aa8faebb75087fa69d4e7b2de22823c1dffc8f4e34f3d9b03`. No source was downloaded again and no production pointer changed.

This is an input boundary, not national enrollment. Candidate projection, registry/coverage consumer integration, production dependency pins and a verified production rebuild remain required. Identity matching, governed geographic assignment and public export remain disabled. Reverting this module and its tests does not change retained releases or production data.

Verification: all 943 repository tests passed, including three new import tests for exact accepted membership/provenance, option/cancellation rejection and altered records/receipt claims. Lint, web and desktop builds and desktop smoke passed; production dependency audit reported zero vulnerabilities. An independent read-only review found no concrete issue. Full check log: `data/tmp/oh-registry-input-check.log` (local, ignored).

## App-backed reporting candidates

`runner/oh-childcare-registry-adapter.mjs` now exports `loadOhChildcareRegistryCandidates(receiptPath, { signal })`. Its private projection consumes only the verified app input above, not caller-supplied records or fabricated manifest hashes. It repeats app verification after conversion. Source page observation times remain distinct from acquisition completion and processing time.

Each accepted source row contributes one provisional physical-site candidate, one provisional establishment candidate, a source-reported location relationship and field-provenanced assertions. Candidate IDs derive from source dataset/release/object ID; they are not deduplicated business identities. No organization, ownership relationship or inferred county/ZCTA assignment is created. Matching profiles remain empty and geographic-assignment eligibility remains false. Missing ZIP rows are retained without a ZIP assertion; ZIP4 stays separate. Quarantined rows remain accounted for but generate no candidate. Confidence 1 denotes faithful source representation only, not independently verified operation or location accuracy.

Offline conversion of the retained native release produced **4,237 source-row contributions, 8,474 provisional entities, 33,896 assertions, 4,237 relationships and zero match profiles**. The source receipt SHA remains `753fc3190e4a5ce0306f9a25aba8ad02ad70f0920d1783bca60bc114afb42caa`. These are in-memory candidate results, not a published national release or additional downloaded records. All restrictions and provenance remain attached. National registry/coverage enrollment, production dependency pins and the production rebuild remain outstanding. Reverting the adapter does not modify retained data or national pointers.

Verification: all 946 repository tests, lint, web/desktop builds and desktop smoke passed. The three candidate tests include real entity/assertion/relationship schema validation, distinct page/acquisition/processing timestamps, separate ZIP5/ZIP4, missing/invalid ZIP reasons, quarantined-row conservation, null identifiers, deterministic identities and tamper/cancellation rejection. Production dependency audit: zero vulnerabilities. Independent read-only adapter review found no concrete defect. Local check log: `data/tmp/oh-registry-adapter-check.log`.

Next integration migration: introduce an explicit registry version for Ohio without changing historical 2.12–2.14 verification. The reporting writer and verifier need a separate Ohio evidence contract with assignment eligibility false; null-ZIP membership/counts must become source-specific rather than TN-only. Coverage consumers must check eligibility before point-to-county/ZCTA assignment. Add native app receipt/acquisition/normalization dependencies to production planning and keep matching artifacts unchanged. This work is not implied by the candidate conversion above.

## Source-bound geographic reporting contract

`runner/oh-childcare-geographic-evidence.mjs` adds `loadOhChildcareGeographicInput`, `validateOhChildcareGeographicEvidence` and `verifyOhChildcareGeographicMembership`. Geographic rows preserve source names, address ZIP5/ZIP4, lat/lon, source status, actual observation times and candidate/assertion provenance. Every row explicitly declares identity matching and governed geographic assignment ineligible; the presence of valid coordinates does not override that restriction.

Validation requires an opaque process-local context created by loading the verified app-backed source. A private cloned expected-row map prevents caller edits to returned records from changing the reference evidence. Individual-row validation checks exact source membership; whole-cohort verification additionally rejects omissions/duplicates, conserves missing-ZIP rows and re-verifies retained dependencies. The input row array is snapshotted and checked again before returning, so mutation during asynchronous verification is rejected. Syntactically valid or recomputed hashes alone do not establish source membership.

On the retained native release, whole-cohort verification passed with 4,237 rows, 4,237 source ZIP5 values and zero missing ZIPs; county/ZCTA assignment eligibility remained false. No acquisition, publication, national count change or geography assignment occurred.

The context is not serializable authorization. Another process must reload the original immutable app receipt and its acquisition/normalization dependencies before verifying a saved registry artifact; those files must remain available. Registry integration must compare returned source hashes with its declared dependency hashes, not silently choose another release. This contract does not itself enroll Ohio in the national registry or make existing coverage consumers understand Ohio. Reverting the new module does not change retained artifacts or production pointers.

Verification: all 949 repository tests, lint, web/desktop builds and desktop smoke passed; production dependency audit reported zero vulnerabilities. Three new tests cover valid and all-null ZIP cohorts, valid-but-assignment-ineligible points, forged contexts, exposed-row mutation, changed provenance/digests, duplicate and omitted membership, cancellation and retained-file tampering. An additional check against the native 4,237-row input rejected concurrent in-memory row mutation during verification without changing files. Independent read-only review found no concrete gap. Local full-check log: `data/tmp/oh-geographic-evidence-check.log`.

## National registry 2.15 implementation

The national registry builder now accepts an explicit `ohChildcareReceipt`; the standalone command exposes `--oh-childcare-receipt <path>`. Selection produces registry version **2.15.0**, retaining the full verified Ohio app-source descriptor and normalized-release dependency. Without Ohio selection, historical 2.12–2.14 behavior and publisher selection remain unchanged. Ohio's runtime dependency chain is loaded only when Ohio is selected or a 2.15 release is verified, not when ordinary non-Ohio plans execute.

Ohio contributes provisional entities, assertions, relationships, source-ZIP reporting rows and source-specific counts through the existing national partitions. Missing ZIPs remain in the shared unassigned partitions; Tennessee and Ohio counts/reasons remain separate, with a combined missing-ZIP total. Ohio ZIP-summary observation time is checked against acquisition completion, while each record retains its page observation. Fresh and recovered Tennessee origins remain explicit and mutually exclusive alongside Ohio.

The verifier reloads Ohio's retained app dependencies and compares exact canonical record values, source ownership, partition placement, geographic membership and the Ohio source summary. It rejects forged/rehashed assertions, relationships, entities, geographic-assignment claims and summary counts/policy flags. Matching profiles are excluded and their files remain unchanged when Ohio is added to the same input cohort. A 2.15 build verifies its full staged registry before the release/pointer publication step; source verification only at build start is insufficient.

This is a tested registry implementation, **not a promoted national production release**. Existing coverage reporting deliberately rejects registry 2.15 until its assignment-aware migration is implemented. Production planning must also gain explicit Ohio selection and selected Ohio dependency pins before a coordinated rebuild. No production pointer or national dashboard total was changed. The original Ohio app acquisition remains retained and reusable; no download was repeated. Rollback reverts the code/CLI migration while retaining all historical and test artifacts; do not use old code to verify a future 2.15 release.

Verification: the final full repository check passed **953 tests**, lint, web/desktop builds and desktop smoke; dependency audit found zero vulnerabilities. Four new registry integration scenarios cover mixed Ohio ZIP availability, all-null Ohio ZIPs, Ohio with fresh Tennessee and Ohio with recovered Tennessee. They compare unchanged matching-artifact hashes and reject rehashed source-summary, canonical entity/assertion/relationship and geographic-policy mutations. Existing Tennessee scenarios remain passing. Missing and duplicate Ohio CLI selections were rejected before build execution. Independent review identified summary binding and non-Ohio import-pin gaps; both were repaired, including hashing the exact bounded summary bytes consumed. Final local check log: `data/tmp/oh-registry-215-final-check.log`.

Next coverage migration should use an explicit new version paired with registry 2.15, preserve optional fresh/recovered Tennessee origin, validate Ohio membership against the declared app source and branch before county point assignment. Report valid points, missing points and assignment-ineligible evidence separately. Preserve Ohio state/source and source-ZIP totals, including all-null-ZIP cohorts, while keeping Ohio derived county/ZCTA assignments at zero. Update the exact coverage-gap transformation contract and test historical version rejection before production selection is enabled.

## National coverage 2.11 implementation

Coverage version **2.11.0** now pairs explicitly with registry **2.15.0**. It reloads the declared retained Ohio app source, verifies full geographic evidence membership and preserves optional fresh/recovered Tennessee origin. Ohio contributes reported state and source ZIP counts, with distinct valid-point, missing-point and assignment-ineligible totals. Processing branches before county point assignment, so Ohio contributes zero derived county assignments; ZIP membership is source-reported rather than inferred. Separate ZIP5/ZIP4 and local-review-only restrictions remain unchanged.

The verifier binds retained registry identity, source dependencies, origin, counts and Ohio ZIP provenance/policy. Ohio-specific state, county, ZIP, source, national and gap checks compare source-derived expectations, not just internally consistent totals. Coverage view parsing hashes the exact streamed bytes consumed, with a 2 GB artifact bound and 2-million-character row bound; summary JSON is bounded to 200 MB. Only the Ohio ZIP fields are retained for source-specific validation, avoiding an extra full national ZIP view in memory. The staged 2.11 release is verified before release/pointer publication. Earlier coverage versions remain supported without loading Ohio's runtime dependency chain.

Four integration scenarios exercise mixed/all-null Ohio ZIPs and coexistence with fresh/recovered Tennessee. A synthetic county contains the valid Ohio point, proving the eligibility bypass rather than merely an out-of-bound coordinate. Rehashed mutations cover state counts, prohibited county assignment, source point counts, required gaps, retained publisher/dependency identity and ZIP distribution policy. Generated gaps validate against the updated exact-version schema.

This remains an implementation migration, **not national production promotion**. Production planning still needs explicit Ohio selection and dependency pins, followed by an app-owned retained-data rebuild. No acquisition was repeated, no production pointer changed, and no public redistribution was enabled. Routine downloads remain Co*Tive operations, not agent-supervised loops. Rollback reverts this code migration while preserving retained releases; prior code cannot verify coverage 2.11.

Verification: the final repository check passed 953 tests, lint, web/desktop builds and desktop smoke; dependency audit reported zero vulnerabilities. Independent read-only review identified retained declaration and ZIP policy-binding gaps, both repaired with regression tests. The existing production ZIP view is 589,427,781 bytes; the final implementation streams rather than imposes the initial too-small 200 MB view limit. Final check log: `data/tmp/oh-coverage-211-final-check.log`.
