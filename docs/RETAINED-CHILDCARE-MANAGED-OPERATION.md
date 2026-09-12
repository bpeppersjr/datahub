# Managed retained-childcare snapshot operation

Optional v2 reuse is described in [Restricted retained samples](RETAINED-CHILDCARE-RESTRICTED-SAMPLES.md). The original empty-object v1 operation remains unchanged; v2 accepts only explicit `includeRetainedSamples: true`.

Status: the live app operation completed and its saved snapshot was independently verified. Pinned downstream enrollment and a read-only map-side comparison panel passed full release validation.

The authenticated local control plane accepts `POST /api/data-operations/cohort-snapshots` with an empty JSON object. It allocates a `cohort-snapshot` operation and persists its receipt before returning HTTP 202. The app chooses the output directory and operation identity. Paths, source selections, precomputed counts, credentials and transport overrides are not accepted from this endpoint.

The fixed standalone child is `scripts/build-retained-childcare-cohort-snapshot.mjs`, supplied the operation-owned output directory and `--operation-id`. It replays retained source evidence locally and builds a new snapshot; it does not refresh source data. Existing snapshots should be reused for map reads and downstream consumers rather than rebuilding on every request.

The parent validates the returned manifest descriptor against the exact operation-scoped path, UUID, native execution mode, operation identity and expected hash. Child exit zero alone is not successful publication. Internal snapshot contents are not registered as downloadable export artifacts. A later map reader must use the verified descriptor and preserve source-specific policy and proof labels.

Status and cancellation use the existing `/api/data-operations/operations/{id}` and `/api/data-operations/operations/{id}/cancel` routes. Failed or cancelled builds may retain a committed descriptor with inspection required; they must not become `SUCCEEDED` merely because an artifact exists. Interrupted process ownership is handled by existing managed-operation restart rules, not automatic source retries or lock stealing.

This operation does not update national pointers, promote counts into national completeness, perform business deduplication, schedule recurring refreshes or integrate the heatmap UI. The standalone native snapshot documented in [storage evidence](RETAINED-CHILDCARE-SNAPSHOT-DESIGN.md) is separate from a managed-operation handoff.

Before live dispatch: pass operation lifecycle, descriptor-binding, cancellation/recovery, auth and full repository checks. Record the real operation ID and persisted terminal receipt separately. Then wire the map to the retained result without source replay on ordinary reads.

Focused verification: 39 tests passed across managed snapshots, existing managed collections/exports/schedules, control-plane security and snapshot storage/CLI. They cover native-mode/hash/path/operation binding, failed and cancelled committed-reference retention, unresolved restart ownership, no snapshot export artifacts, and the actual three-field CLI recovery envelope. A subprocess module-mock test verifies that a CLI final-read failure still returns the committed descriptor and exits nonzero. Fixture lifecycle successes validate parent bookkeeping and snapshot integrity, not actual source acquisition or native replay.

Snapshot verification is dynamically loaded only when a snapshot child returns evidence. An integrated startup test caught the static import pulling source-specific runtime prerequisites into unrelated control-plane startup; the lazy load resolves that regression. Focused ESLint passes. No new actual operation receipt or live worker has been submitted in this validation step.

Release verification: `data/tmp/managed-cohort-snapshot-full-check.log` records successful `npm run check`: 1,519 tests, 1,508 passed, 11 skipped, zero failures, followed by lint, web/desktop builds and desktop control-plane smoke. Installed PDF, Iowa and seven-source replay checks were enabled. TypeScript passed and `npm audit --omit=dev` found zero vulnerabilities. All 82 protected production pins remain unchanged. These checks prove the implemented lifecycle, not a live handoff or map integration.

## Accepted live application handoff

After implementation commit `59a54a0`, the authenticated app accepted operation `bafb683b-f4ae-4355-983a-d2a3c85e7d9b` at `2026-09-09T03:17:47.737Z` with HTTP 202. The returned state was RUNNING; the immediately inspected durable receipt existed at `data/managed-operations/bafb683b-f4ae-4355-983a-d2a3c85e7d9b/receipt.json` with matching ID/kind and persisted QUEUED state. These observations establish accepted handoff, not successful completion.

Co*Tive owns this local offline build. No source refresh or national promotion was requested. Inspect this same operation's terminal receipt and descriptor next; do not submit a replacement merely because the acceptance-time receipt was not terminal. Map integration remains outstanding.

## Verified completion and reusable enrollment

The same operation completed `SUCCEEDED` at `2026-09-09T03:18:24.701Z`, with no error, no inspection requirement, seven available sources and no missing sources. Terminal receipt SHA-256: `5de68167b873461bc37c6fe7fcff19dc5d920c4b332370dbd56f91ea323ab7e3`.

Its snapshot is `data/managed-operations/bafb683b-f4ae-4355-983a-d2a3c85e7d9b/output/jobs/ef5c1cef-a2c2-4854-9092-7e1e60e409ea/manifest.json`, SHA-256 `194b20da203cb95c2d0aa3ebb794c7e817391fda8cb8785c09bb6d49f067cef4`. An independent offline read verified integrity, native mode and exact parent-operation binding. Accepted source rows remain PA 4,995; CT 1,390; MD 1,772; VT 503; CO 1,648; UT 422; IA 1,476. No source replay was performed by this read.

`config/retained-childcare-snapshot-enrollment.json` pins the terminal operation receipt. `loadRetainedChildcareSnapshotEnrollment` verifies that receipt, exact operation-scoped descriptor, snapshot integrity, source availability counts and build/operation chronology before returning the view. It rereads receipt/config bindings before returning. Missing installed receipt or snapshot is unavailable, never measured zero; invalid evidence fails closed. Its two focused tests pass, including the real completed app snapshot with network access disabled. Full release checks for this added enrollment remain pending.

Reuse this enrolled result for downstream comparisons. Do not submit another build merely to show the map. Enrollment does not integrate the map, export internal records or alter national production totals.

## Read-only map-side comparison

The authenticated `GET /api/business-map/retained-childcare` route reads the pinned successful snapshot. It accepts no query options, does not launch an operation, does not replay sources and does not expose absolute verification paths. Missing installed evidence is unavailable; failed integrity checks return a redacted error. The live local endpoint returned HTTP 200 for the same completed operation and all seven publisher cohorts, with `source_replay_performed_this_read: false`.

The Business Intelligence right-hand map panel shows these source cohorts when all categories or childcare is selected. It follows state and reported ZIP selection, labels the accepted-source denominator, and keeps unknown address-state evidence explicit. County/ZIP selection does not turn publisher cohorts into county or ZCTA totals. An unresolved state withholds counts. These results are separate from existing map shading and national totals; they are not unique active-business counts or measured U.S. completeness.

Three unit-render/contract tests cover scope isolation, ZIP cohort share, unknown/unavailable/error states and a read-only client lifecycle. Control-plane tests include authentication for this route. No visual browser inspection was performed. No hosted deployment, refresh schedule, source request or replacement snapshot build was initiated for this panel.

Validation history: the first full run exposed six existing business-name harness failures because its isolated module loader did not resolve the new panel import. The harness now stubs that separately tested child and asserts its state/ZIP wiring; all nine focused UI tests pass. A subsequent run passed 1,510 tests but three Vermont fixture deadlines expired across a Windows-recorded sleep (`2026-09-09T03:46:42.5748231Z` to `2026-09-09T04:47:18.5184648Z`). All 16 tests across the affected Vermont files passed unchanged after wake. Source deadlines were not relaxed and no production job was retried.

Final release evidence: `data/tmp/retained-childcare-panel-release-check-awake.log` records successful `npm run check`: 1,524 tests, 1,513 passed, 11 skipped, zero failures, then lint, web and desktop builds and desktop control-plane smoke. Installed PDF, Iowa and retained-cohort checks were enabled. TypeScript passed, production dependency audit found zero vulnerabilities, and all 82 protected production pins remained unchanged.

Rollback: revert the panel/route/enrollment integration commit to restore the prior UI. Preserve the completed operation receipt and snapshot; rollback does not require deleting retained evidence or repulling data.
