# Business source temporal status

The overall business view now assigns an explicit temporal assessment to every source in the current coverage release. It keeps three different ideas separate:

1. the publisher/source reference date carried by the release;
2. the time a normalized profile was first and last observed in Datahub; and
3. whether a legal, license, tax, program, or statistical status proves that a business is generally operating.

The third answer is always **no**. `Active`, `Current`, `Good Standing`, a program authorization, or inclusion in a filing system retains its source-specific meaning. It is never silently converted to a universal operating-business claim.

## Review policy

`runner/business-source-temporal-status.mjs` pins one policy for each of the 26 current source views. Each policy identifies the authoritative release-metadata field, its evidence scope, a cadence class, and an internal `review_after_days` threshold. These thresholds are Datahub review controls; they are not publisher service-level agreements and do not prove that a source has changed or become invalid.

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

Against coverage release `national-business-coverage-views-20260902-115337634Z-ba689784` at `2026-09-03T12:00:00.000Z`, all 26 sources have configured policies and source-reference evidence. Twenty-five are within their internal review windows. `ny_retail_food_store_license_sites` is review-due: its source reference is `2025-09-30`, 337 days old against a 120-day review threshold. This is a refresh/governance signal, not a claim that every corresponding license is inactive.

The management API includes `source_temporal_summary` in `GET /api/business-coverage` and a `temporal_status` object on each `GET /api/business-coverage/sources` row. The Sources view displays its reference date and review status.

## Boundaries

The audit is read-only. It does not download a source, alter a release, infer an expiration date, remove a record, geocode an address, create business geometry, execute a postal migration, or change a production pointer.
