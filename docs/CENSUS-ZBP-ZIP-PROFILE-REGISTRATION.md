# Retained Census ZBP ZIP profile registration

`config/datasets/census-zbp-zip-profile-index.json` is metadata-only registration
of the independently verified native release. It creates no current pointer,
production enrollment, national denominator, endpoint, or acquisition operation.

Manifest SHA-256:
`485f19b9715eb3807ef4d6dfa5a98c353645690f47c3b55a52b16487933e316d`.
The 7,236-byte manifest binds 20 artifacts totaling 2,015,507,248 bytes (excluding
manifest), 2,974,116 source industry rows and 37,828 ZIP profiles. Its explicit
build clock is `2026-10-02T21:30:00.000Z`; reference year remains **2023**.
The catalog copies exact artifact descriptors and separately binds their ordered
inventory through SHA-256 of UTF-8 `JSON.stringify(manifest.artifacts)`.

Source pointer/manifest, all 12 selected source descriptors, geography
pointer/manifest/dependency, and Census policy identity remain exactly bound.
Export remains `local-review-only`. Census hierarchy rows are nonadditive;
unpublished/suppressed values remain distinct from explicit zero. These historical
employer aggregates are neither named businesses nor current-operation, GDP,
all-business completeness, or authoritative current USPS evidence. ZIP4 remains
separate and nongeometric; a build clock does not refresh source dates.

Run `node --test runner/census-zbp-zip-profile-registration.test.mjs` for the
read-only metadata check. It hashes bounded metadata, reconciles descriptors,
counts, clocks, policy and current source/geography identities, and stats the
closed release roster and artifact sizes. Negative tests reject changed pins,
counts, hierarchy/operation claims, GDP, and enrollment. It does not read/hash
profile or index contents, decompress source partitions, or repeat native replay.
Full verification is separately recorded in `docs/CENSUS-ZBP-ZIP-PROFILE-INDEX.md`.

Removing this catalog reverses metadata registration only; immutable artifacts
and existing runtime pointers remain unchanged.
