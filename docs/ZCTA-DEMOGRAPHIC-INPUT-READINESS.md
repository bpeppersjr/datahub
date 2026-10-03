# ZCTA demographic input readiness

This local-review-only release projects the exact 33,791 records in the registered 2020 Census ZCTA geography index. Each row retains the source's direct `population_2020` and `housing_units_2020` totals. Race, ancestry/lineage, sex, and age are explicitly unavailable (`false`); the artifact contains no invented zeros or demographic percentages.

ZCTAs are Census statistical areas, not USPS ZIP Codes. The release makes no USPS ZIP, GDP, production-readiness, or demographic-completeness claim. It performs no network request, writes no `current.json`, and creates no production enrollment or schedule.

Build with `npm run zcta-demographic-readiness:build`. Verify an immutable manifest with `npm run zcta-demographic-readiness:verify -- --manifest <path>`. Verification independently replays the pinned geography index, its hashes, every derived row, release identity, inventory, and the 33,791-row conservation rule.

The builder does not accept a caller-supplied timestamp. `created_at` is captured from UTC during the invocation, after source replay and within the builder's bounded 15-minute invocation interval. Cancellation is cooperative at source replay and publication boundaries. A single-owner local lock rejects concurrent builds; cleanup is limited to the invoking build's UUID staging directory and owned lock.

Rollback is removal of this additive release family and its code/configuration. No existing pointer or source release is changed.

## Retained releases

The initial retained release `zcta-demographic-input-readiness-ba754567a14b3e7aa177f7c702320a5a6c01935f686a449bbc99aa1d06a2de0a` has manifest SHA-256 `373550cbdc749c6250253a2d8be21cd406fb186bf5b990e2c0ab0edc9f4c021d`. It remains immutable and is registered as pre-hardening evidence, not selected for review.

The hardened successor `zcta-demographic-input-readiness-4f26ad46c785afc6b9e9044bce377af1d31eec0bfef9d7da0524c63ae05d7023` was created at actual invocation UTC and has manifest SHA-256 `00e6874f173b0e824a2f169b4b752861f52e48b50027df27b9f17cfb97b3d952`. It is the release selected for local review in `config/datasets/zcta-demographic-input-readiness.json`. This registration is not a mutable data pointer and does not enroll the release in production.

## Bounded lookup index

The selected release is served through immutable pointer-free index release `zcta-demographic-readiness-index-eaa415c4b89f2362e192f2d47a5511661f7b2440c3dd34db9bf85a1d130973ed`, registered in `config/datasets/zcta-demographic-readiness-index.json`. Its manifest SHA-256 is `8618e6d54ee560984ce883a13d68f9a9d1a88deb85c3c83c66c7357764480d12`. The index conserves all 33,791 rows in bounded two-digit-prefix shards and binds each ZCTA to the exact byte offset, byte count, and SHA-256 of its source row.

```powershell
npm run zcta-demographic-readiness-index:build -- --source-manifest data/zcta-demographic-input-readiness/releases/zcta-demographic-input-readiness-4f26ad46c785afc6b9e9044bce377af1d31eec0bfef9d7da0524c63ae05d7023/manifest.json --created-at 2026-10-03T14:38:59.832Z
npm run zcta-demographic-readiness-index:verify -- --source-manifest data/zcta-demographic-input-readiness/releases/zcta-demographic-input-readiness-4f26ad46c785afc6b9e9044bce377af1d31eec0bfef9d7da0524c63ae05d7023/manifest.json --manifest data/zcta-demographic-readiness-index/releases/zcta-demographic-readiness-index-eaa415c4b89f2362e192f2d47a5511661f7b2440c3dd34db9bf85a1d130973ed/manifest.json
```

The verifier independently replays the selected source and every index shard. Runtime lookups validate both registrations, both manifests, the selected source binding, the shard hash and schema, and the exact source-row slice before returning the unchanged readiness view. Building and lookup perform no network acquisition, create no current pointer, and do not enroll the release in production. This index improves exact lookup cost only; it does not add race, ancestry/lineage, sex, age, demographic percentages, GDP, or official USPS ZIP evidence.
