# Oklahoma retained batch status projection

The app-owned Oklahoma acquisition adapter and approval-bound handoff are already implemented. The September 10 dispatch failed on its first search response (HTTP 502); this slice does not build another collector, authorize recovery, retry any intent, replace an approval or change a receipt.

`runner/ok-childcare-batch-status.mjs` adds a pure typed projection and a read-only wrapper around the existing `inspectOkZipBatch`. `scripts/inspect-ok-childcare-batch-status.mjs --output ABSOLUTE_PATH` exposes it without modifying the original collection CLI. The original CLI belongs to the approved implementation hash roster: even editing its inspect-only output would change the regenerated plan hash. Every existing pinned implementation file remains untouched in this slice.

## Query accounting

`planned_new_queries = accepted_queries + rejected_queries + unresolved_intent_queries + never_issued_queries`.

`terminal_queries = accepted_queries + rejected_queries`.

Baseline reuse is separate from planned new work: `reused_baseline_queries` and `reused_baseline_source_rows` must not inflate newly accepted queries/rows. Accepted rows are summed query-source rows, not deduplicated providers or businesses. An accepted empty response is one accepted query with zero rows; it does not establish search or statewide completeness. Rejection rows remain null in the original journal, never converted into accepted zero-row responses.

An unresolved intent is a planned query absent from both verified terminal results and the inspector's never-issued roster. The existing inspector validates its retained intent, ordered journal prefix and absence of result; the wrapper does not infer acquisition success or retry eligibility. The projection checks disjoint query identities, prefix order, status consistency and conservation. Missing/malformed/drifted verification produces unavailable counts (null), not zero.

## Verification and execution boundary

Pure projection is labeled structural-projection-only even when supplied native-looking metadata. Only the wrapper can label a result current-pinned-retained-inspector, after the existing inspector succeeds and the saved plan content/hash matches that result. Returned data contains counts, statuses and plan pins, not result rows, provider contacts or raw error bodies. Cancellation throws without a partial successful result. There are no writes, timers, retries or source transports in the helper. The existing verifier may read its substantial retained planning inputs; this is not a lightweight per-render API or long-lived cache. Its result describes inspection-time evidence, not future journal state.

Six focused tests and owned ESLint passed. Fixtures cover rejected-versus-terminal counts, unresolved intents, accepted empty queries, incomplete prefixes, reuse separation, malformed/overlapping/sparse/alternate-iterator input, pre-abort and unsupported CLI arguments. No synthetic fixture asserts native retained verification. Full application validation and app-managed/UI integration remain outside this independent slice.

## Current native prerequisite

A bounded read-only comparison of the retained approved plan's 29 implementation pins with current main files found one changed file: `runner/industry-segments.mjs`. The retained plan SHA remains `e92b31b9dc94ff2a3ebbdbdab60afbc9e4e84637ff7f916400427a279beaf122`, with 666 planned new queries and one separate reused baseline. Because `inspectOkZipBatch` regenerates the plan from current implementation pins and requires exact equality with the retained plan, the old journal cannot currently pass that verifier. This is an inspection compatibility prerequisite, not permission to rewrite pins, reapprove or reacquire. The new wrapper intentionally returns current-pinned-retained-inspection-not-verified if invoked under that mismatch; no permissive historical-verification bypass was added.

The existing retained documentation and small terminal-result read show zero accepted new queries, one rejected query, 665 never-issued queries and a separate four-row reused baseline. Those historical observations are not a newly successful wrapper replay. No native wrapper run, spatial inventory/large ZIP replay, source request or download was performed in this slice.

Rollback removes the new helper/test/standalone CLI/note only. Immutable source receipts, approved implementation files and existing app operation behavior remain unchanged.
