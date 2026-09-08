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

## Live application outcome — September 8, 2026

Managed collection `b56d91bb-b781-4fe6-b7f9-be50bd4234ee` completed `SUCCEEDED` at `2026-09-08T17:08:03.718Z`. Co*Tive ran the source worker independently after accepted dispatch. No agent remained assigned to download progress. The managed receipt is `data/managed-operations/b56d91bb-b781-4fe6-b7f9-be50bd4234ee/receipt.json`.

The app job `a6997ff5-9dd9-40de-a1aa-600a23da5ff2` completed at `2026-09-08T17:07:54.815Z`. Its receipt is under `data/industry-segments/runs/b56d91bb-b781-4fe6-b7f9-be50bd4234ee/state-pa-childcare-centers-PA/jobs/a6997ff5-9dd9-40de-a1aa-600a23da5ff2/receipt.json`; SHA-256 `1c1fd0682b258d0f6ee0f196f5a7961b743129c6d7fda285bb0f8cd1d4a952e0`.

Independent offline verification replayed both linked releases and checked the industry source log hash and its normalized-manifest linkage. This performed no provider requests. After completion, both the native publisher lock and app output-root ownership lock were absent. Acquisition used 24 requests and consumed 6,306,237 decoded response bytes; publisher catalog update was `2026-08-13T14:32:18.000Z`, distinct from the September collection time.

| Verified cohort measure | Result |
|---|---:|
| Publisher-selected rows / distinct location keys | 4,995 / 4,995 |
| Accepted / quarantined | 4,995 / 0 |
| Records with ZIP5 / separate ZIP4 | 4,995 / 0 |
| Distinct reported ZIP5 values | 819 |
| Distinct source county names / county FIPS labels | 66 / 66 |
| Records with source coordinates / missing coordinates | 4,930 / 65 |
| Coordinates as percentage of accepted source rows | 98.6987% |
| Records lacking numeric capacity | 730 |
| Conflicting source state-FIPS labels | 0 |

All 730 unavailable numeric capacities preserve the exact publisher text `School Age Provider`; this is not a parser failure that should be repaired by inventing a number. The 65 missing coordinates remain nullable. The 819 ZIPs and 66 county labels are observed source memberships, not independently validated boundary assignments, proof of every county/ZIP being covered, or missing-business counts. ZIP4 absence must not be filled from assumptions.

Immutable child pins:

- Acquired run `2195b750-4238-4bac-b660-8ac12cb2cce9`, manifest SHA-256 `a69e32dc12306da46439f72d220733c0f564e8180f018100da3b2d43eb90b743`.
- Normalized run `b671f126-0aa4-451e-b5a2-fb4949dc838d`, manifest SHA-256 `0bed669a79c7074aa3782949be25564f300a22bc7287995ea10ebef2546b0be5`.
- Industry source log SHA-256 `bb268c92c49fbe51e8fb79051f2ef077511053df40840660c83669dcbdf10338`.

Next integration must consume these retained, verified manifests rather than repeat acquisition. A reporting adapter must keep licensed/listed-center evidence separate from identity matching and distinguish within-source percentages from a national denominator. No national reporting pointer, production plan, schedule or export permission changed. The offline verifier establishes internal consistency and lineage, not independent remote-source authentication or current business operation.
