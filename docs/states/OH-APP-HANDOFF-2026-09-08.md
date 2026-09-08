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
