# Wisconsin immutable offline-review releases

Co*Tive can assemble and independently verify supplied Wisconsin acquisition evidence without Codex and without contacting the publisher. This is an **offline-review bundle**, not an authorized live collection, publisher-authenticated snapshot, production reporting release or export approval. Wisconsin's source-use decision is still pending.

## Standalone commands

```powershell
node scripts/build-wi-childcare-offline.mjs <source-observation.json>
node scripts/verify-wi-childcare.mjs <immutable-manifest.json>
```

The builder accepts an optional `--output <folder>`. Every path must remain under `datahub`; default output is `data/business-sources/wi-dhs-licensed-group-childcare/offline`. Inputs are bounded, canonical, non-linked UTF-8 JSON files. The verifier requires a `releases/<release-id>/manifest.json`, not a current pointer or staging manifest. Both commands handle cooperative signals/IPC and make no network requests.

Each bundle contains five checksummed artifacts and a manifest:

- `selected-features.jsonl`: unchanged selected source rows in validated ID order, internal only.
- `normalized.jsonl`: separate ZIP5/ZIP4, point-only business records and field/provenance links, local-review-only.
- `quarantine.jsonl`: rejected source-row links and reasons, internal only.
- `source-observation.json`: the complete supplied acquisition evidence, including both preflights and original page observations, internal only.
- `publisher-metadata.xml`: exact XML bytes from the paired metadata evidence, internal only.

The manifest carries source-row counts, normalization/gap summaries, policy configuration and hash, observation and processing times, artifact bounds/hashes, and explicit false acquisition/export/authenticity/national-coverage claims. An all-quarantine input still produces a review bundle with empty normalized output; verification does not convert that into acceptable business coverage. Normalization's `release_published:false` remains its own pre-publication transformation result, while the bundle's manifest separately records offline storage status.

## Integrity and publication

Verification replays acquisition and normalization and compares every artifact byte, manifest field, policy, timestamp and count. Updating an artifact's hash in the manifest does not conceal a changed ZIP, omitted row or fabricated claim. The same retained source features and metadata yield the same content-based source-snapshot ID across processing runs; that is a provisional local identity, not a publisher release identifier. A new run/processing time creates a separate immutable bundle without altering original observations or older releases.

The writer uses exclusive ownership, bounded reads, fsynced files, manifest-last staging, two pre-commit verifications and an atomic directory commit. The `offline/current.json` pointer names only a compatible offline-review release; it cannot replace a foreign/live pointer. Output roots inside `releases`, `.staging` or existing manifest-bearing bundles are rejected before directory creation. Junctions, symlinks, hardlinked files, unexpected artifacts and stale-looking foreign locks are not silently accepted or removed.

Cancellation before commit cleans only individually owned staging files and releases its owned lock, leaving prior bundles and pointers intact. Ordinary failures preserve staging evidence for inspection. After the commit boundary, pointer finalization is non-cancellable; a finalization failure can leave a committed immutable bundle with the previous pointer still in place. Neither automatic resume nor stale-lock recovery is implemented. This is not recurring scheduling or app queue enrollment.

## Verification scope and remaining work

Ten new synthetic tests cover exact five-artifact replay, all-quarantine retention, repeated processing, self-rehashed artifact/claim tampering, extra files, hardlinks, junctions, existing locks, cancellation cleanup, preserved ordinary-failure evidence, hook-time mutation, standalone build/verify commands and forbidden nested output roots. Test bundles remain isolated under `data/tmp`; they are not actual Wisconsin facility data.

The full `npm run check` attempt ran 832 tests: 831 passed and the known preview-conflicting lifecycle test failed. After the build and graceful preview stop, both lifecycle tests plus the ten final release tests passed together (12/12); desktop smoke passed and preview was restored with HTTP 200. Final release tests passed again after adding explicit offline/authorization flags to the result. This covers 833 distinct tests across runs, not one clean full-check exit. Lint, TypeScript, final web/desktop builds and production dependency audit passed (zero reported vulnerabilities). Logs: `data/tmp/wi-release-full-check.log`, `wi-release-focused-check.log`, `wi-release-desktop-check.log` and `wi-release-final-build.log` in the same directory. Parallel read-only review identified the protected-output-root fix. All 40 production code pins remained unchanged.

Remaining work: source-use authorization decision, bounded live HTTP acquisition, complete connector prerequisites/manifest, managed-app enrollment, actual operation handoff and verified source integration. This offline increment does not change those approval flags or increase national business coverage.

Rollback removes the new offline-release module/tests/commands and leaves retained evidence intact. Default storage is separate from the future live source pointer. No existing production data or production-pinned implementation was changed.
