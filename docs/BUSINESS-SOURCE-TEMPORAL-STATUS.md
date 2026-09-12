# Business source temporal status

The overall business view now assigns an explicit temporal assessment to every source in the current coverage release. It keeps three different ideas separate:

1. the publisher/source reference date carried by the release;
2. the time a normalized profile was first and last observed in Datahub; and
3. whether a legal, license, tax, program, or statistical status proves that a business is generally operating.

The third answer is always **no**. `Active`, `Current`, `Good Standing`, a program authorization, or inclusion in a filing system retains its source-specific meaning. It is never silently converted to a universal operating-business claim.

## Review policy

`runner/business-source-temporal-status.mjs` policy version `1.1.0` covers the 30 legacy profile source views in the current production release (and separately supports the nonemployer statistical baseline). This denominator does not include every retained data-service cohort or the distinct Minnesota credential artifact. Dated-source policies identify the reviewed release-metadata field, its evidence scope, a cadence class, and an internal `review_after_days` threshold. These thresholds are Datahub review controls; they are not publisher service-level agreements and do not prove that a source has changed or become invalid.

MA, NJ, OH and TN childcare policies explicitly declare publisher currency unmeasured in the retained source contract. They have no allowed publisher-reference fields and no review interval. They remain `missing-source-reference`, with null publisher date, age and review-due date. Their `retained_source_observation.observed_at` records the collection observation separately; neither that clock nor normalized profile observation times can establish publisher currency. An unrelated metadata date does not silently upgrade these policies. Future source-date enrollment requires its own reviewed contract migration.

Every assessment emits:

- source reference field, value, normalized instant, and date;
- age at a caller-supplied as-of instant;
- review threshold and due date;
- `within-review-window`, `review-due`, `missing-source-reference`, `future-source-reference`, or `unconfigured-source-policy`;
- source-specific evidence scope; and
- normalized first/last observation times, explicitly labeled as Datahub observations rather than publisher currency.

New source views remain visible as `unconfigured-source-policy` until a policy is reviewed. Missing and malformed reference evidence also remains visible instead of falling back to ingestion time.

## Run the read-only audit

```powershell
npm run source-temporal:audit -- --as-of 2026-09-03T12:00:00.000Z --summary-only --allow-review-due
```

Without `--allow-review-due`, the command exits nonzero if any source is due, lacks source reference evidence, carries a future reference, or lacks a configured policy. `--summary-only` returns only exceptional source rows while preserving the complete summary.

Against coverage release `national-business-coverage-views-20260911-040908332Z-f01c882a` at the explicit audit instant `2026-09-12T13:27:49.000Z`, the pre-migration audit has 30 profile source views: 25 within their review windows, one review-due and four unconfigured. Under policy version `1.1.0`, those four become configured but `missing-source-reference`, not current: expected totals are 30 configured, 25 within-window, one review-due, four missing-reference and zero unconfigured. The audit continues to exit 1 without `--allow-review-due`.

`ny_retail_food_store_license_sites` retains reference `2025-09-30T15:15:15.000Z`, 346 elapsed whole days at that audit instant, against an internal 120-day review threshold. Its publisher describes an annual snapshot. Being review-due proves neither that a newer edition exists nor that any corresponding license or business is inactive; the recent Datahub observation does not reset the source date. This assessment neither requests a refresh nor authorizes acquisition.

The management API includes `source_temporal_summary` in `GET /api/business-coverage` and a `temporal_status` object on each `GET /api/business-coverage/sources` row. The Sources view displays its reference date and review status.

## Boundaries

The audit is read-only. It does not download a source, alter a release, infer an expiration date, remove a record, geocode an address, create business geometry, execute a postal migration, or change a production pointer.
