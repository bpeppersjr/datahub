# App-owned Overture metadata prerequisite

`overture-source-preflight` is a managed source prerequisite, not a places download or an approval for one. Submit only `{ "sourceId": "overture-source-preflight" }` to the authenticated local `POST /api/data-operations/source-prerequisites` endpoint. Co*Tive dispatches `scripts/probe-overture-source-preflight.mjs` in its own child process and retains the operation receipt. No Codex session is needed to run that child.

The worker accepts only an app-owned output directory and operation UUID. It fetches the fixed public STAC catalog, latest places collection and its item metadata from `stac.overturemaps.org`. It never requests the declared S3/Parquet assets. Source policy remains [the existing Overture review](OVERTURE-US-PLACES.md); retained metadata does not grant public export rights or establish business completeness.

## Bounds and evidence

- At most 34 requests, 2 MiB per response, 16 MiB total, at least 250 ms between requests.
- GET only; no credentials, redirects, retries or compressed responses. Fixed host/path allowlist; no caller-provided release or URL.
- 15-second request timeout and 120-second overall cooperative cancellation deadline. These are not hard process deadlines; cleanup drains pending operations.
- Exclusive run directory, retained raw JSON and SHA-256 checksums, manifest published last. Failures preserve partial output for inspection.
- Independent reader replays the exact retained metadata itinerary offline through the same schema validator, verifies file inventory and hashes, operation binding, mode and timestamps. No asset request is needed for verification.

Clean managed completion sets `metadataReady: true`, but always `acquisitionReady: false`. Failure, cancellation or recovery envelopes cannot advertise readiness. Artifacts remain internal, unavailable through the public artifact-download route. Native readers reject injected-test mode; hashes and execution-mode labels are integrity bookkeeping, not cryptographic proof of a network origin against a malicious local writer.

## Handoff and recovery

Use the persisted operation ID and prerequisite descriptor in later app-owned work. A completed receipt is not automatically refetched after restart. Interrupted ownership becomes unresolved and requires inspection; no automatic retry, resumption or freshness policy is claimed. A new explicit prerequisite request can refetch metadata, so reuse a verified retained receipt when a refresh is unnecessary.

The [bounded app-owned acquisition session](OVERTURE-ACQUISITION-SESSION.md) can consume this retained prerequisite with a separate explicit large-acquisition authorization. Running this prerequisite never launches that acquisition. Declared global row counts are neither US business counts nor a completeness percentage. The retained runtime prerequisite is reused separately, not downloaded again here.

Rollback: remove this source ID's managed enrollment and script dispatch while preserving existing receipts and artifacts. No dataset migration or national promotion is performed.

## Release verification — 2026-09-09

`npm run check` passed: 1,637 tests, 1,626 passed, 11 skipped, zero failures; lint, web/desktop builds and desktop control-plane smoke passed. Log: `data/tmp/overture-source-preflight-full-check.log`. `npm audit --omit=dev` reported zero vulnerabilities; `npx tsc --noEmit` passed. All 82 file hashes pinned by the protected production plan remained unchanged.

Focused coverage includes offline replay, native rejection of injected mode, response/size rejection without retry, cancellation draining a late fetch, CLI argument rejection, artifact/result/clock/binding/inventory tampering, fixed managed dispatch, shared-slot exclusion, failed/cancelled/recovery readiness masking, and completed-receipt reuse after restart. Manager positive fixtures deliberately use fabricated native-shaped metadata; they do not prove live acquisition.

One native app-owned operation completed successfully: `c7fd0208-eb13-442a-8982-8a5d1ef2927e`, with receipt at `data/managed-operations/c7fd0208-eb13-442a-8982-8a5d1ef2927e/receipt.json`. Its prerequisite run is `baebc1bd-6d22-4a17-a274-dedadb4ebf8c`; manifest SHA-256 is `b74f312d931de95aaa2dab916a2a35684f7daaa9ee0edc2fb226a609a2f4f1d8`. The app independently replayed 18 metadata responses totaling 72,008 bytes. Release `2026-08-19.0` declares 16 assets and 73,631,092 global source rows; these are metadata declarations, not acquired or verified US businesses. STAC fingerprint: `36e62492e9474442b81f1f7bc3efc8b5d49308c75fe33c943169852abfa7f64f`. Receipt: `metadataReady: true`, `acquisitionReady: false`; no place acquisition occurred.
