# Pinned Census baseline input for Overture

`buildOvertureUsPlaces` now accepts exactly one of the legacy `zbpPointer` or a `zbpSelection` object containing an absolute `manifest` path and its expected lowercase SHA-256. The selected path must name `manifest.json`. The pinned path never reads `current.json`; pointer changes cannot select a different baseline for that call.

The new `verifyOvertureZbpSelection` admission layer reads at most 4 MiB of manifest JSON and checks the expected hash before calling the existing complete Census release verifier. It requires published, complete-national baseline identity, 1–64 unique app-contained artifacts, ordinary single-link files, at most 128 MiB per stored artifact and at most 1 GiB combined stored bytes. It checks canonical directories and file identity before and after verification, and rechecks manifest identity and hash. Errors use a fixed diagnostic rather than returning arbitrary source content.

The Census verifier checks all declared artifact hashes, ZIP/NAICS counts and detail partition record counts. This is integrity/count verification, not independent recomputation of the Census statistics or proof of publisher authenticity. The admission limits cover stored bytes, not decompressed CSV bytes. The existing Census verifier's decompression, parsing and cancellation behavior still needs hardening before exposing arbitrary inputs through a managed production worker. Cancellation is checked before and after that verifier, not during every internal operation; no hard deadline or OS memory cap is claimed.

Normalization copies the selection value at admission, checks the selected baseline before loading it, and performs a second complete verification before writing its completed manifest. Its `baseline_selection` records the release ID, manifest hash, verification scope and `managed_receipt_bound: false`. Replay rejects conflicting selection/dependency claims. Existing replay baseline bytes remain retained in the output.

## Tests and real retained input

All 18 focused tests passed before the final claim-consistency check was added. New tests exercise a synthetic complete structural fixture, normalization with an invalid unused current pointer, separate ZIP input admission, incorrect hash, accessors, cancellation admission, rehashed count claims, corrupted files, hardlinks, duplicate inventory, escaping paths and stored-size limits. The synthetic fixture is not publisher evidence.

The new selection verifier also passed against the actual retained baseline `census-zbp-2023-20260830-134622645Z-4da1edc0`, with manifest SHA-256 `db6ec348a46b4b3ad9692aafc1d47fd388308031e397fb5de8e0193df19bf271`, 14 artifacts, 121,099,407 stored bytes and 37,828 ZIP/ZCTA-union entries. No reacquisition was needed.

Full `npm run check` passed: 1,686 tests, 1,675 passed, 11 skipped, zero failed, plus lint, web/desktop builds and desktop control-plane smoke. Log: `data/tmp/overture-pinned-baseline-full-check.log`. TypeScript passed and the production dependency audit found zero vulnerabilities. All 82 protected plan pins were unchanged.

The actual retained baseline also passed a complete pinned-input normalization/replay probe using one explicitly synthetic business record, all 37,828 baseline entries, and no current-pointer access. It finished retained, not promoted. Evidence: `data/tmp/overture-national-baseline-probes/1171fecb-ae51-4504-b2ff-b8d30e165eff/evidence.json`. This is integration evidence, not a managed receipt or business coverage gain.

## Migration and remaining work

The legacy pointer path remains available for existing callers and does not gain full-release verification automatically. New managed integration should use the pinned input and resolve its permitted selection from application-owned evidence; a caller-supplied checksum alone is not an authenticated receipt. The command-line wrapper has not yet added pinned-selection flags, and the app has not yet enrolled managed normalization. No production normalization, promotion, acquisition or scheduler change was performed.

Rolling back removes pinned-input support; callers using it must not silently fall back to a mutable pointer. Retained data and current pointers are unchanged by this code release.
