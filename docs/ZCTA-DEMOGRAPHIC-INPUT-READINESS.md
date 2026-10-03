# ZCTA demographic input readiness

This local-review-only release projects the exact 33,791 records in the registered 2020 Census ZCTA geography index. Each row retains the source's direct `population_2020` and `housing_units_2020` totals. Race, ancestry/lineage, sex, and age are explicitly unavailable (`false`); the artifact contains no invented zeros or demographic percentages.

ZCTAs are Census statistical areas, not USPS ZIP Codes. The release makes no USPS ZIP, GDP, production-readiness, or demographic-completeness claim. It performs no network request, writes no `current.json`, and creates no production enrollment or schedule.

Build with `npm run zcta-demographic-readiness:build`. Verify an immutable manifest with `npm run zcta-demographic-readiness:verify -- --manifest <path>`. Verification independently replays the pinned geography index, its hashes, every derived row, release identity, inventory, and the 33,791-row conservation rule.

The builder does not accept a caller-supplied timestamp. `created_at` is captured from UTC during the invocation, after source replay and within the builder's bounded 15-minute invocation interval. Cancellation is cooperative at source replay and publication boundaries. A single-owner local lock rejects concurrent builds; cleanup is limited to the invoking build's UUID staging directory and owned lock.

Rollback is removal of this additive release family and its code/configuration. No existing pointer or source release is changed.

## Retained releases

The initial retained release `zcta-demographic-input-readiness-ba754567a14b3e7aa177f7c702320a5a6c01935f686a449bbc99aa1d06a2de0a` has manifest SHA-256 `373550cbdc749c6250253a2d8be21cd406fb186bf5b990e2c0ab0edc9f4c021d`. It remains immutable and is registered as pre-hardening evidence, not selected for review.

The hardened successor `zcta-demographic-input-readiness-4f26ad46c785afc6b9e9044bce377af1d31eec0bfef9d7da0524c63ae05d7023` was created at actual invocation UTC and has manifest SHA-256 `00e6874f173b0e824a2f169b4b752861f52e48b50027df27b9f17cfb97b3d952`. It is the release selected for local review in `config/datasets/zcta-demographic-input-readiness.json`. This registration is not a mutable data pointer and does not enroll the release in production.
