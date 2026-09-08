# Vermont childcare selected delivery and internal-use contract

## Outcome

The selected-field delivery check found that GET does not honor the tested field-suppression options, while the documented POST JSON form does. Future record acquisition must use fixed POST requests; it must not silently accept extra columns or change methods after an access denial. The existing metadata/aggregate preflight remains unchanged.

This is source-validation evidence, not a retained facility release, complete collection, app operation, recurring schedule or national promotion. Four bounded validation requests were made: two rejected GET response shapes and two accepted POST sample pages. No provider names, license values, addresses, coordinates or raw response bodies were retained in this report or Git. The accepted pages contained four distinct release-scoped license keys in memory; sample uniqueness is not business identity or full-cohort completeness.

## Internal use and truthful gaps

The source's previously validated `OPEN_DATABASE_LICENSE` designation supports a bounded internal sample and a separate internal acquisition policy. [ODbL sections 3 and 4](https://opendatacommons.org/licenses/odbl/1-0/) grant conditional extraction and modification and distinguish internal use from public-use obligations. No additional legal-approval prerequisite was identified by this review. Preserve attribution and the license notice; public redistribution and combined database exports require their own notice/share-alike/access assessment. Individual content and privacy rights remain separate. No account, credential, click-through or access workaround was used; this does not mean licensed use is unconditional.

Unknown reporting-file date encoding and unspecified address role are quality limitations, not reasons to prevent governed source-candidate retention. Preserve `reporting_period: null`, `reporting_period_verified: false`, the raw reporting filename and publisher monthly-cohort wording. Retain addresses as `reported-address-role-unspecified`; do not infer source-reported state, verified premises, current operation, exact geocodes or unique businesses. Keep ZIP5 and ZIP4 separate in normalization. Do not replace or reinterpret historical preflight receipts whose readiness fields describe the earlier metadata-only stage.

## Failed GET shape checks

Both GET requests used the same public `https://data.vermont.gov/api/v3/views/ctdw-tmfz/query.json` endpoint, the preflight's exact 17-field projection and center predicate, `ORDER BY file_name,license_id`, `pageNumber=1`, and `pageSize=2`.

The first response passed HTTP 200/JSON and two-row checks but included `:id`, `:version`, `:created_at`, and `:updated_at`. The validator stopped before recording field values or proceeding to page 2. A second GET added `includeSystem=false` and `includeSynthetic=false` as URL parameters; it produced the same unexpected column names and was rejected. These were schema failures, not access denials. The first local process also emitted a Node/libuv shutdown assertion after its uncaught validation error; that process did not create a release or make a second-page request. Subsequent probes caught errors explicitly.

## Successful documented POST shape checks

The vendor documents [POST query options](https://dev.socrata.com/docs/queries/), [system-column suppression](https://dev.socrata.com/docs/queries/includesystem), and [synthetic-column suppression](https://dev.socrata.com/docs/queries/includesynthetic). Two serial native POST requests to the same endpoint used JSON:

```json
{
  "query": "SELECT address_1,address_2,county,current_license_end_date,current_license_start_date,file_name,infant_licensed_capacity,license_id,license_type,preschool_licensed_capacity,provider_name,provider_program_type,provider_town,school_age_licensed_capacity,toddler_licensed_capacity,total_licensed_capacity,zip_code WHERE license_type='Licensed Provider' AND provider_program_type IN('CBCCPP','CBCCPP - Non-Recurring') ORDER BY file_name,license_id",
  "page": { "pageNumber": 1, "pageSize": 2 },
  "includeSystem": false,
  "includeSynthetic": false
}
```

The second request changed only `pageNumber` to 2. Both omitted credentials, rejected redirects, used 20-second deadlines and a 1,000,000-byte decoded-body cap, and were separated by at least one second. JSON was decoded with fatal UTF-8 validation. Scope, allowed columns, exact two-row lengths and distinct sampled license keys were checked before reporting shapes.

| Page | Observed UTC | HTTP | Body bytes | Body SHA-256 |
| --- | --- | ---: | ---: | --- |
| 1 | 2026-09-08T20:23:42.230Z | 200 | 1,139 | `ee988407f1c8bdf2f16b95054f999c3e4191cdd9694f270b382589754b1c3b61` |
| 2 | 2026-09-08T20:23:43.488Z | 200 | 1,153 | `d2563d5024f6a3e4a9feb159bf61478b2f7fc1ec329ee20ba96c276902761384` |

Both responses were bare JSON arrays containing only allowed fields. `address_2` was omitted in all four sampled rows. Every other selected field was a string: the five capacities were unsigned integer strings; both calendar-date fields were floating timestamps with millisecond precision and no timezone suffix. Preserve missing/null values and raw dates rather than inferring timezone or assuming these four rows prove all possible serializations. Raw bodies were discarded; these hashes identify observed bodies but cannot be independently replayed from this report.

## Next executable acquisition contract

Implement the collector with a separate internal record-use policy and configuration pins; do not expand the metadata-only policy in place. Preserve the exact selected projection, center predicate and `ORDER BY file_name,license_id`. Selected pages and license rosters use POST JSON with both suppression flags false, never a runtime GET/POST fallback. A roster should select `file_name,license_id` with identical filtering and ordering.

Use fresh paired preflight evidence, persist prerequisites before record requests, then baseline roster pages, selected pages, a matching final roster, and a postflight. Journal each validated page before the next request. At a proposed page size of 500, require exact expected lengths and an empty terminal page for every traversal; this is a design limit, not a page size proven by the two-row sample. For N rows, the itinerary is `12 + 3 * (ceil(N / 500) + 1)` requests: 21 for the previously observed 503 rows and at most 135 for a 20,000-row ceiling.

Require release-scoped unique keys, exact ordered selected-key membership against the baseline, matching final roster, reporting-file agreement and conservation of program-type and non-null license-date aggregates. Do not sort publisher identifiers using assumed JavaScript collation. Enforce serial pacing, finite byte/time/disk budgets, cancellation, strict response columns, redacted failures, immutable output and independent offline replay. Matching before/after observations are not an atomic-snapshot guarantee.

Only after acquisition, normalization and app lifecycle are implemented and verified should Co*Tive receive collection through an accepted operation and persisted handoff receipt. Routine downloads then belong to its standalone workers. No such Vermont operation was dispatched during this validation.
