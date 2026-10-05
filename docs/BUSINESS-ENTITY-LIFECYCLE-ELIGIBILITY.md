# Business entity lifecycle eligibility

`business-entity-lifecycle-eligibility@1.0.0` is a pointer-free, local-review-only derived qualification layer for the retained national registry location profiles. It does not alter registry bytes, identity links, source adoption, acquisition authority, export permissions, or production plans.

## Rebuild and verify

The build and verifier use only pinned local artifacts:

```powershell
npm run business-entity-lifecycle:build
npm run business-entity-lifecycle:verify
```

The generated immutable release shards live under the ignored `data/business-entity-lifecycle-eligibility/releases/` directory. Do not add these generated payloads to Git. The tracked registration pins one selected release and its manifest SHA-256; readers fail closed if the registered release, taxonomy, source registry, temporal claim matrix, or exact-ZIP temporal qualification no longer matches the selected lineage.

## Scope and lineage

The selected release is `business-entity-lifecycle-eligibility-f37556f8722c5a48c114a763ce1786cbe2e6d11b985b875602a97afb45671057`, manifest SHA-256 `fe97a5b260a7c9c38c8884d668ba6f99b237ca4ec0f6885af587efd349f428ae`. It contains 8,011,835 profile decisions in 100 ZIP2 shards across exactly 15 source cohorts and 17 status categories (16 exact non-null source status values plus the separately enumerated Los Angeles null-status category).

Every row binds the profile ID, exact source and source-release IDs, a digest of source-record lineage, source policy ID and policy SHA-256, a digest and closed-taxonomy value for the raw source status, profile observation time, source reference time, fixed assessment time `2026-10-02T16:30:00.000Z`, and the temporal-claim and exact-ZIP qualification lineage. `review_status` is one of `within-review-window`, `stale`, `unmeasured`, or `unmapped`. `lifecycle_evidence` is one of `source-defined-current`, `non-active-reporting`, `unknown`, or `contradictory`.

Audited exceptions are retained separately: 633,232 Los Angeles profiles have null source status and remain `unknown`; 2,667 California ABC profiles report a positive `expiration_before_observation_count` and remain `contradictory`; and 24,230 New York retail-food profiles remain stale and non-active reporting evidence. The separate Colorado organization-assertion note is explicitly outside the profile denominator and is not a 19-million-row profile decision cohort.

## Claim boundary

`current_operation_verified` and `active_business_eligible` are false for every decision, including profiles with publisher labels such as “Active,” “Open,” or “Current.” NPPES enumeration and practice-location rows remain reporting membership, not operation. The assessment clock is fixed to the selected review and is never recalculated from runtime or build time. This layer does not infer closure, continuous operation, physical establishment, identity resolution, business completeness, or permission to enroll, acquire, publish, or dispatch.

The names API joins each matching-profile result to the corresponding verified lifecycle shard and returns the exact selected release binding. Flat JSONL/CSV exports include `lifecycle_eligibility` as required provenance; reporting-only childcare rows explicitly carry `null` because they are not part of the 8,011,835 retained matching-profile cohort.
