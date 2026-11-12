# App-owned bounded Overture acquisition

The management page includes an authenticated, read-only readiness card backed by `GET /api/data-operations/overture-readiness`. It verifies retained metadata and runtime prerequisites, shows the legacy failed run’s journal when available, and identifies newer checkpoint-format operations that need verification. The route allocates zero operations and makes zero network requests. Authorization is supplied separately with each managed acquisition request.

Co*Tive can now execute the bounded selected-source acquisition as a managed child process. A live Codex or ChatGPT session is not required to run or supervise it. This worker retains selected source evidence; it does **not** normalize, reconcile or publish businesses, refresh the national registry, or establish complete coverage.

## Operator handoff

The authenticated local endpoint is `POST /api/data-operations/overture-acquisitions`. A new attempt requires `metadataOperationId`, `runtimeOperationId` and the explicit `authorization` confirmation defined by the connector. To recover a stopped checkpoint-format operation, also supply `resumeOperationId` and the same verified prerequisite IDs used by that operation. Co*Tive pins the terminal receipt hash internally and returns a new operation ID. Use the most recent stopped operation in the recovery chain. The readiness card remains read-only.

The manager resolves the two IDs from its own operation storage, requires successful native prerequisites with verified artifacts and clean readiness flags, and independently rereads their evidence before allocating an acquisition. The fixed CLI receives the IDs and pinned manifest hashes. It rereads the persisted prerequisite receipts and checks their hashes before executing. Caller-provided source URLs, release overrides, output paths, engine settings and transport overrides are not accepted by the API.

The accepted response contains the application operation ID. The existing operation-status and cancellation endpoints apply. Hand the task to the application after acceptance; do not hold an agent open to poll routine download progress. Completed receipts and the selected snapshot remain available for later local processing without reacquiring the source. Manual resubmission is **not** automatically deduplicated; inspect/reuse a completed snapshot rather than sending a new acquisition merely to promote it.

The retained native prerequisite operations available when this was implemented were:

- Metadata: `c7fd0208-eb13-442a-8982-8a5d1ef2927e`.
- Runtime: `b4ae8318-e786-4ac8-bf7b-e673c6d00ae1`.

They are not an authorization to start a large download. This release was tested with local fixture assets only; no native places acquisition was dispatched.

## Execution and limits

The worker composes the retained metadata and runtime readers, durable request journals, bounded native transport, capability-protected loopback bridge, and fixed DuckDB selection. The v2 plan binds the original prerequisite manifests to the ordered STAC asset list and one-asset query fingerprint before remote requests. Each asset has a private journal and a durable pin for its release URL, strong ETag, and byte length. Range reads use `If-Match`, and recovery compares a new HEAD to any retained pin before requesting a range.

- One sequential upstream request at a time, minimum 250 ms pacing; no redirects or retries.
- At most 100,000 request reservations and 32 GiB of reserved response ranges across the original operation and its recovery attempts. A range is at most 64 MiB. Pending reservations count against both limits.
- Fixed allowlisted Overture S3 host and release paths from the verified metadata. No full-download fallback or automatic extension installation.
- One DuckDB thread, 2 GiB engine memory setting and 4 GiB spill setting. These are not an operating-system process RAM cap or security sandbox.
- 10 GiB available-disk preflight for extraction; output writer also checks disk headroom while writing. Selected output: at most 20 million rows, 16 MiB per line, 16 GiB uncompressed and 4 GiB compressed.
- 30-second cooperative transport request timeout and four-hour cooperative session deadline. Pending callbacks and I/O are drained; no hard process deadline or wire-byte cap is claimed. Managed cancellation uses the existing cooperative-then-forced child shutdown policy.

Large acquisition must be explicitly approved for these limits. Extra RAM does not change source policy, request rate or authorization. A run that exceeds a bound fails and preserves its evidence; it does not silently enlarge its budgets.

## Retained receipt and recovery

Each run directory contains a source-bound plan, per-asset checkpoint evidence, the combined selected gzip, and a manifest published last. The success descriptor has status `selected-source-retained-not-published`. The independent reader verifies the following evidence.

- prerequisite descriptors, exact modes and clocks, and the plan's source asset list;
- selected-file hash, bounded gzip decoding, exact selected fields, US-address and closure filters, row/byte counts;
- each completed checkpoint’s journal and pin hashes, successful HEAD and GET evidence, and cumulative accounting across interrupted attempts;
- the fixed query fingerprint, engine settings, file inventory, single-link file ownership, and concatenation of all selected gzip members in source-asset order.

Bridge capability URLs and arbitrary remote error bodies are not written to receipts or exposed as errors. Artifact-download routes keep acquisition artifacts internal. A clean child exit **and** successful independent verification are required for `snapshotReady: true`. Failure, cancellation, recovery envelopes and unresolved ownership cannot advertise readiness. A post-publication failure preserves the descriptor as an inspection reference.

Recovery is explicitly dispatched after the previous operation stops. Co*Tive verifies all inherited checkpoint bytes before any source request, then skips the verified assets entirely. The unfinished asset restarts from its beginning. The worker preserves partial journals and charges every complete reservation, including a pending request whose completion was lost. A final unterminated write can be ignored because the transport syncs each full reservation before making its request. Malformed complete lines, mismatched pins, corrupted checkpoints, and unresolved ownership block recovery.

An OS-backed SQLite lock excludes competing acquisition workers in the managed store and releases when the worker exits, including a forced termination. A successor record prevents branching or resetting the cumulative budget. The chain allows eight attempts. Cancellation closes and drains owned work when possible, and the manager uses its existing forced termination grace. The worker also cancels on loss of its management IPC connection. Recovery is tested across process termination and requires the preceding operation’s private files and its original pinned prerequisite artifacts. Power-loss durability has not been verified.

The historical acquisition `a8ff9f6d-b2be-4d56-905b-17984788b1d5` used the v1 format. Its journal has 24 reservations, 23 completions, and a pending range request for asset index 2. The selected gzip is zero bytes and there is no completed checkpoint or failure diagnostic identifying the cause. Co*Tive keeps the operation for inspection. A future attempt for that release requires fresh authorization and starts a new checkpoint chain.

## Data and policy boundary

The worker uses the existing selected-field query: source-reported US address, place point latitude/longitude and selected identity, taxonomy, brand and provenance fields. Geometry, bounding boxes and unselected contact fields are excluded. The source-native postcode remains source evidence; downstream normalization continues to separate canonical ZIP5 and ZIP4.

Source status and taxonomy are not proof of legal business status or current operation. The snapshot reader checks extraction structure, not semantic normalization, uniqueness or national completeness; downstream governed normalization and quarantine are still required. A source-reported point is not independently verified address geocoding.

The [existing Overture source policy](OVERTURE-US-PLACES.md) and attribution/NOTICE obligations remain in force. No public-export rights are inferred from a successful acquisition. Acquisition claims keep normalized publication and complete US coverage false.

## Migration and rollback

The v1 receipt reader remains available for historical successful sessions. V2 receipts and their private checkpoint lineage require the v2 reader. Before rolling back, stop the acquisition worker cooperatively and preserve its operation, prerequisite, and recovery files.

## Release verification — 2026-09-09

`npm run check` passed: 1,656 tests, 1,645 passed, 11 skipped and zero failures; lint, web/desktop builds and desktop control-plane smoke passed. Log: `data/tmp/overture-acquisition-session-full-check.log`. TypeScript passed; production dependency audit reported zero vulnerabilities. All 82 protected production-plan file hashes remained unchanged.

The real-engine fixture loaded the already-retained native runtime, served a small local Parquet fixture through the injected transport, ran the complete session and independently verified three selected records. It made no external source requests. Unit checks cover cancellation draining a late source response, source/engine failure and closed bridge ownership, incomplete accounting, malformed CLI/input, missing authorization, corruption/rehashed contracts, and private error handling. Managed success/restart and failed/cancelled/recovery readiness tests use explicitly fabricated native-shaped receipts, not live acquisition evidence.

After restarting Co*Tive, an authenticated request containing the retained prerequisite IDs but omitting acquisition authorization returned HTTP 400. The operation count remained 17 before and after: no acquisition was allocated. The app returned HTTP 200. No live large-acquisition operation or native source-download receipt is claimed by this release.
