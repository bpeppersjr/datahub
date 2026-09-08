# Pennsylvania childcare: standalone application handoff

Co*Tive owns routine acquisition and normalization after connector validation. No active Codex/ChatGPT session is required. Pennsylvania is enrolled under `childcare`, source ID `state-pa-childcare-centers`, state `PA`. Enrollment alone is not a successful collection: use the managed operation ID, industry receipt, source log and linked app receipt as evidence.

## Operation

Use the local authenticated collection controls with industries `["childcare"]`, states `["PA"]`, and sourceIds `["state-pa-childcare-centers"]`. The managed runner starts `scripts/build-pa-childcare.mjs`, supplies its industry run ID, and retains checksummed execution logs. The CLI independently re-verifies app and child manifests before reporting success.

Standalone commands (from datahub):

```powershell
node scripts/build-pa-childcare.mjs --output "C:\Master Data\datahub\data\pa-childcare-app"
node scripts/build-pa-childcare.mjs --output "C:\Master Data\datahub\data\pa-childcare-reuse" --acquired "<absolute retained acquisition manifest>"
node scripts/verify-pa-childcare-app.mjs --receipt "<absolute app receipt>"
```

The first command performs fresh native collection; the second performs only offline normalization from verified retained acquisition. Never run fresh collection just to promote or repair processing of existing data.

## Durable boundaries and limits

- Each UUID job saves start, acquired and normalized checkpoints, then an immutable terminal receipt. Child releases use separate UUID-scoped work directories. Verification rejects borrowed child releases except the explicitly pinned retained acquisition.
- A native publisher lock excludes overlapping PA app collections across output roots; unknown ownership is never stolen. Offline reuse and injected tests do not take the native publisher lock. Each output root also has an ownership lock.
- Native acquisition remains serial and source-paced: at least one second between requests, 30-second request deadline, 80 requests, 20,000 rows and 150 MB consumed response ceiling. App deadline is cooperatively 30 minutes, with a 1 GB free-disk precheck. Available RAM does not increase provider request rates.
- Cancellation drains child writers before persisting the terminal outcome and releasing ownership. Successfully published acquisition and normalization remain available even if later work fails or is cancelled. Forced termination, OS stalls and uncertain cleanup require receipt/lock inspection, not automatic restart.
- No automatic retries, interrupted-run resumption or recurring schedule is enabled by this enrollment. Failure receipts are inspection evidence, not successful-release verification. Verify retained input before any recovery.

## Data interpretation

This source covers publisher-listed Child Care Centers, not every childcare provider or every operating business. Internal selected source and local normalized candidates retain provenance. ZIP5/ZIP4 are separate; geocodes are nullable latitude/longitude only. Missing coordinates, postal information and quarantined records remain explicit. Source membership, license numbers and geocodes are not independent proof of current operation, identity or national completeness. Public export, national reporting integration and current-pointer promotion remain separate and disabled here.

Rollback disables the PA entry in industry configuration without deleting immutable acquisition, normalized releases, app receipts or historical pins. Do not remove live-worker enrollment or locks while a collection is running.

## Verification — September 8, 2026

Full `npm run check` passed: 1,223 tests, 1,212 passed, 11 explicit skips and zero failures; lint, web/desktop builds and desktop control-plane smoke passed. TypeScript and production dependency audit passed (zero vulnerabilities). Log: `data/tmp/pa-childcare-app-full-check.log`. Updated native cross-output exclusion, managed-path and nested-app-work tests also passed in a separate focused rerun. All 82 pending national production code/configuration pins remained unchanged.

These checks use synthetic PA facility rows, including real acquisition/normalization persistence and offline CLI reuse, and do not themselves establish a live source collection. Live operation receipts, when dispatched, remain the authoritative handoff evidence.
