# Approved Oklahoma batch: standalone app dispatch

On 2026-09-10, after the recorded approval, the existing authenticated local Co*Tive app accepted the explicitly selected Oklahoma childcare source with HTTP 202.

- Operation: `c12cb298-a6be-4493-811b-0196d7905488`.
- Accepted at: `2026-09-10T17:16:15.344Z`.
- Source: `state-ok-childcare-spatial-batch`, state `OK`, industry `childcare`.
- Approval: `78ec4fe1-dac0-40e9-aac7-e5672f67f7fe`.
- Exact plan: `e92b31b9dc94ff2a3ebbdbdab60afbc9e4e84637ff7f916400427a279beaf122`.
- Preflight free disk: 253,207,519,232 bytes; required: 4,930,435,456 bytes.

The app persisted its operation receipt under `data/managed-operations/c12cb298-a6be-4493-811b-0196d7905488/receipt.json`. The live supervisor was PID 21536 and its live collection child PID 16804 at handoff. These PIDs are historical observations, not future evidence of liveness or permission to terminate a process.

The source adapter persisted an approval-bound intent under `data/industry-segments/runs/c12cb298-a6be-4493-811b-0196d7905488/state-ok-childcare-spatial-batch-OK/intent.json`. The immutable batch plan and first ZIP intent, `66778.intent.json`, were present under `data/business-sources/ok-childcare/approved-zip-batches/78ec4fe1-dac0-40e9-aac7-e5672f67f7fe`.

This proves app-owned dispatch and entry into the approved worker, not completion or successful source delivery. At the initial handoff the receipt was RUNNING and no query result had yet been published. Read the current operation and source receipts for subsequent results; do not treat this note as a live status feed.

No recurring schedule was enabled. No production reporting pointer changed. Routine acquisition is owned by the app and does not require a Codex polling loop. Do not restart the app while it owns this job. A failure or interrupted intent requires inspection rather than reissuing the query or creating another approval identity.

Verification was operational: current scope/approval validation, available disk, no active prior collection or source exclusions, an exact one-task app plan, authenticated dispatch, persisted receipts and live child verification. No application code changed; the prior full suite is described in the [app handoff report](OK-BATCH-APP-HANDOFF-2026-09-10.md). No new full-suite success is claimed.

## Terminal inspection

The operation subsequently FAILED at `2026-09-10T17:16:28.425Z`. Offline inspection verified the retained plan, intent, and result: the batch is `inspection-required`, not running or complete.

The first query was ZIP `66778`, a material cross-state Census intersection. Its prerequisite client GET returned HTTP 200 with the expected 34,517 bytes and SHA-256 `62305f4dac2fa558c7961faabbb5a074b245d8e73f85069029df76bf4693e217`. The actual provider search returned HTTP 502. Its body was not accepted or retained; no third request was issued. The transport recorded `source-contract-not-satisfied` and the query was rejected without candidate rows.

HTTP 502 establishes an unsuccessful source response, not why the upstream service failed. There is no evidence here of an access ban, invalid ZIP, zero matching businesses, or a parser defect. Do not label it any of those or evade the failure with alternate IPs.

- New successful ZIP queries: **0**.
- Rejected ZIP queries with retained diagnostics: **1** (`66778`).
- Never-issued ZIP queries: **665**.
- Reused baseline: ZIP `73102`, four retained source rows; not newly downloaded.
- Requests issued: **2**; accepted decoded bytes: **34,517**.
- Native collection child PID 16804 was absent at inspection; the source-lock directory was empty. No lock was deleted or reclaimed by the inspecting agent.

The current CLI's `completed_queries: 1` means one terminal query record, including rejection; it does **not** mean one successful acquisition. The detailed inspected result explicitly has `status: rejected` and `rows: null`.

Evidence hashes:

- `66778.result.json`: `0267e342923199cddc13b3b1ea1efb1916dc9297a09c7b15b7267d67d22529b6` (1,085 bytes).
- Terminal managed receipt: `6d7db0b1f0f95b9cef804d649e0981585f705431e134478a27b6638e396c2603` (2,064 bytes).

No retry, new approval identity, skipped-query workaround, or additional source request was made during inspection. The original approved worker deliberately stops on a rejected intent. Recovery requires a separately reviewed decision about retrying this query or changing the continuation policy; the existing approval is not blanket permission for either. Retain all evidence and pursue independent source work in the meantime. No national production pointers changed.
