# Managed retained-childcare snapshot operation

Status: implementation, focused integration tests and full release checks passed. A live app dispatch was accepted; its terminal outcome is not yet verified here.

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
