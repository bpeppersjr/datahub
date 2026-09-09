# App-owned bounded Overture acquisition

Co*Tive can now execute the bounded selected-source acquisition as a managed child process. A live Codex or ChatGPT session is not required to run or supervise it. This worker retains selected source evidence; it does **not** normalize, reconcile or publish businesses, refresh the national registry, or establish complete coverage.

## Operator handoff

The authenticated local endpoint is `POST /api/data-operations/overture-acquisitions`. It accepts exactly `metadataOperationId`, `runtimeOperationId` and `authorization`. The latter must be the existing explicit large-acquisition confirmation defined by the Overture connector; it is never defaulted or synthesized by the API. There is no new acquisition form in the UI in this release.

The manager resolves the two IDs from its own operation storage, requires successful native prerequisites with verified artifacts and clean readiness flags, and independently rereads their evidence before allocating an acquisition. The fixed CLI receives the IDs and pinned manifest hashes. It rereads the persisted prerequisite receipts and checks their hashes before executing. Caller-provided source URLs, release overrides, output paths, engine settings and transport overrides are not accepted by the API.

The accepted response contains the application operation ID. The existing operation-status and cancellation endpoints apply. Hand the task to the application after acceptance; do not hold an agent open to poll routine download progress. Completed receipts and the selected snapshot remain available for later local processing without reacquiring the source. Manual resubmission is **not** automatically deduplicated; inspect/reuse a completed snapshot rather than sending a new acquisition merely to promote it.

The retained native prerequisite operations available when this was implemented were:

- Metadata: `c7fd0208-eb13-442a-8982-8a5d1ef2927e`.
- Runtime: `b4ae8318-e786-4ac8-bf7b-e673c6d00ae1`.

They are not an authorization to start a large download. This release was tested with local fixture assets only; no native places acquisition was dispatched.

## Execution and limits

The worker composes the retained metadata/runtime readers, durable request journal, bounded native transport, capability-protected loopback bridge, fixed DuckDB selection and streamed gzip output. It requests each asset's length/ETag before extraction, rejects ETag changes, and maps asset indices to the immutable metadata asset list in `plan.json` **before** making asset requests.

- One sequential upstream request at a time, minimum 250 ms pacing; no redirects or retries.
- At most 100,000 requests and 32 GiB of reserved response ranges per run; at most 64 MiB per range. Failed reservations are not refunded.
- Fixed allowlisted Overture S3 host and release paths from the verified metadata. No full-download fallback or automatic extension installation.
- One DuckDB thread, 2 GiB engine memory setting and 4 GiB spill setting. These are not an operating-system process RAM cap or security sandbox.
- 10 GiB available-disk preflight for extraction; output writer also checks disk headroom while writing. Selected output: at most 20 million rows, 16 MiB per line, 16 GiB uncompressed and 4 GiB compressed.
- 30-second cooperative transport request timeout and four-hour cooperative session deadline. Pending callbacks and I/O are drained; no hard process deadline or wire-byte cap is claimed. Managed cancellation uses the existing cooperative-then-forced child shutdown policy.

Large acquisition must be explicitly approved for these limits. Extra RAM does not change source policy, request rate or authorization. A run that exceeds a bound fails and preserves its evidence; it does not silently enlarge its budgets.

## Retained receipt and recovery

Each immutable run directory contains a source-bound plan, engine-selected gzip, request journal and manifest published last. The success descriptor has status `selected-source-retained-not-published`. The independent reader verifies:

- prerequisite descriptors, exact modes and clocks, and the plan's source asset list;
- selected-file hash, bounded gzip decoding, exact selected fields, US-address and closure filters, row/byte counts;
- journal hash and event sequence, completed HEAD and GET evidence for every asset, no pending request, and conserved counters;
- query fingerprint, bounded engine settings, file inventory, ownership and single-link integrity.

Bridge capability URLs and arbitrary remote error bodies are not written to receipts or exposed as errors. Artifact-download routes keep acquisition artifacts internal. A clean child exit **and** successful independent verification are required for `snapshotReady: true`. Failure, cancellation, recovery envelopes and unresolved ownership cannot advertise readiness. A post-publication failure preserves the descriptor as an inspection reference.

Interrupted work is not automatically retried or resumed. Partial runs retain their plan/journal/output for investigation; a partial journal may contain a reserved request whose transferred bytes are not represented by completed counters. This is not a resumable checkpoint. Receipt hashes and native-mode labels are integrity bookkeeping, not cryptographic proof of source origin against a malicious local writer.

## Data and policy boundary

The worker uses the existing selected-field query: source-reported US address, place point latitude/longitude and selected identity, taxonomy, brand and provenance fields. Geometry, bounding boxes and unselected contact fields are excluded. The source-native postcode remains source evidence; downstream normalization continues to separate canonical ZIP5 and ZIP4.

Source status and taxonomy are not proof of legal business status or current operation. The snapshot reader checks extraction structure, not semantic normalization, uniqueness or national completeness; downstream governed normalization and quarantine are still required. A source-reported point is not independently verified address geocoding.

The [existing Overture source policy](OVERTURE-US-PLACES.md) and attribution/NOTICE obligations remain in force. No public-export rights are inferred from a successful acquisition. Acquisition claims keep normalized publication and complete US coverage false.

## Migration and rollback

No existing dataset or protected production plan is changed. This adds one managed operation kind and API endpoint. Rollback should first establish that no acquisition is running, then remove the new dispatch/enrollment while preserving retained receipts and files. Do not roll back a live worker by deleting its output or source prerequisites.

## Release verification — 2026-09-09

`npm run check` passed: 1,656 tests, 1,645 passed, 11 skipped and zero failures; lint, web/desktop builds and desktop control-plane smoke passed. Log: `data/tmp/overture-acquisition-session-full-check.log`. TypeScript passed; production dependency audit reported zero vulnerabilities. All 82 protected production-plan file hashes remained unchanged.

The real-engine fixture loaded the already-retained native runtime, served a small local Parquet fixture through the injected transport, ran the complete session and independently verified three selected records. It made no external source requests. Unit checks cover cancellation draining a late source response, source/engine failure and closed bridge ownership, incomplete accounting, malformed CLI/input, missing authorization, corruption/rehashed contracts, and private error handling. Managed success/restart and failed/cancelled/recovery readiness tests use explicitly fabricated native-shaped receipts, not live acquisition evidence.

After restarting Co*Tive, an authenticated request containing the retained prerequisite IDs but omitting acquisition authorization returned HTTP 400. The operation count remained 17 before and after: no acquisition was allocated. The app returned HTTP 200. No live large-acquisition operation or native source-download receipt is claimed by this release.
