# Vermont childcare metadata and aggregate validation — September 8, 2026

This follow-up supersedes the delivery and schema uncertainties in the [initial discovery](VT-CHILDCARE-TRIAGE-2026-09-08.md), while preserving its indexed observations as historical evidence. No provider records, identifiers, addresses, coordinates or bulk exports were queried. No account, token, payment or access workaround was used; the denied DCF page was not revisited.

## Fresh catalog evidence

At 20:00:12.592 UTC, a bounded native GET of [catalog metadata](https://data.vermont.gov/api/views/ctdw-tmfz.json) returned HTTP 200 and 65,331 bytes. The request rejected redirects, used a 20-second deadline and capped decoded input at 2,000,000 bytes. Only selected schema and catalog information was reported; metadata cached field examples were not retained as provider evidence.

Verified identity: `ctdw-tmfz`, Vermont Child Care Provider Data; owner Child Development Division Data Unit (`ihpx-mmkb`); attribution Department for Children and Families (DCF), Child Development Division. The source describes a monthly cohort of programs in business on the last day of the preceding complete month, not verified operations today.

Current clocks differ from the older indexed July observation: `rowsUpdatedAt=1786726136` (2026-08-14T16:48:56.000Z), `viewLastModified=1786726133` (2026-08-14T16:48:53.000Z), `publicationDate=1786648521` (2026-08-13T19:15:21.000Z). Preserve these separately from source reporting period, row observation and processing time.

The source declares `OPEN_DATABASE_LICENSE`, with its exact notice link `http://opendatacommons.org/licenses/odbl/1.0/`. The [ODbL 1.0 text](https://opendatacommons.org/licenses/odbl/1-0/) provides conditional database extraction, modification and commercial-use rights. Public database/derived-output use carries notice and, where applicable, share-alike and access obligations; internal use is distinguished in section 4.5(c). The license does not clear every separate content, trademark or privacy right. A connector must preserve attribution and source separation and govern public export independently; do not relabel this source public domain. This is source-policy preparation, not legal advice or an unrestricted combined-database export decision.

## Schema consequences

- `file_name` is text tracking the reporting file; `license_id` is text describing a distinct provider license. `provider_id` is explicitly a BFIS Person Record, not a business primary key; omit it from the initial selected cohort. `provider_case` is a licensing-history folder ID, not independently verified premises identity.
- `license_type` includes licensed family homes as well as centers and afterschool programs. `provider_program_type` is needed to exclude homes.
- `provider_name`, `address_1`, `address_2`, `provider_town`, `zip_code` and `county` are text. Address role is not independently established. No explicit address-state field was found; do not turn publisher VT into a claimed source-reported state. ZIP5 and ZIP4 must remain separate after validated parsing.
- License start/end fields are catalog type `calendar_date`. Preserve their source semantics and missing values without treating the download timestamp as an operation date.
- Latitude/longitude are numeric, generated from addresses and deliberately jittered to separate colocated programs. They are **not exact address geocodes**. Initial acquisition should omit these fields or retain them only as explicitly approximate publisher-point evidence; do not use them to verify premises or county/ZIP polygon membership. Independent address geocoding remains a separate future process, not achieved by this dataset.
- Exclude phone/email, person keys and unnecessary contact/referral/accreditation/vacancy fields. Capacities describe theoretical licensed capacity, not observed attendance or employment.

## Anonymous aggregate observations

The [documented SODA v3 interface](https://dev.socrata.com/foundry/data.vermont.gov/ctdw-tmfz) supplied the route `https://data.vermont.gov/api/v3/views/ctdw-tmfz/query.json`. Calls below used `query`, `pageNumber=1` and bounded `pageSize`, no token, with the same time/byte/redirect constraints. This proves these aggregate calls worked anonymously at observation time, not universal future access or complete facility delivery.

At 20:00:39.153 UTC, grouping `file_name,provider_program_type,license_type` and counting rows returned HTTP 200, 775 bytes and five groups. All referenced `Provider_Report_07012026_08012026.xlsx`:

| Program type | License type | Source rows |
| --- | --- | ---: |
| Afterschool Child Care Program | Licensed Provider | 149 |
| CBCCPP | Licensed Provider | 489 |
| CBCCPP - Non-Recurring | Licensed Provider | 14 |
| Licensed FCCH | Licensed Provider | 32 |
| Registered FCCH | Registered Home | 373 |

These sum to 1,057 source rows, not unique active businesses. One observed reporting file does not establish a universal single-file invariant. The file name suggests a July reporting period, consistent with the description and August update; its precise date encoding still needs an explicit contract rather than silently parsing it as an observation timestamp.

At 20:01:41.911 UTC, a second aggregate selected `license_type = 'Licensed Provider' AND provider_program_type IN('CBCCPP','CBCCPP - Non-Recurring')`. HTTP 200, 146 bytes: 503 rows, 503 distinct non-null licenses, one reporting file and 503 non-null license-start and license-end values. No license values were returned. A first local command had a JavaScript quoting error before any network request; the corrected command made this single source call.

[Official DCF licensing material](https://dcf.vermont.gov/cdd-blog/changes-child-care-licensing-rules-effective-october-1-2024) identifies CBCCPP as center-based childcare/preschool and includes non-recurring care. This supports the candidate center cohort while keeping afterschool and family-home rows separately excluded, not absent from Vermont. Public-school/prekindergarten participation may remain within centers, so these cannot all be labeled private businesses.

## Next implementation boundary

Build a versioned metadata-and-aggregate preflight before facility acquisition: bind identity, selected schema, complete description/license notice, the exact center predicate, reporting-file groups, unique-license counts and source clocks in paired observations. Reject incompatible drift and truncated/oversized responses. Define a fixed record-delivery projection and stable ordering only after proving the actual SODA v3 page contract; do not substitute a legacy API or use person IDs as source business keys.

Then implement immutable source retention, postal normalization, gap conservation, source-policy propagation, offline replay and app-owned lifecycle receipts. Preserve source-period status instead of declaring current operation; keep approximate coordinates out of exact-geocode fields. No success-capable connector, source acquisition, app dispatch, recurring schedule or national reporting enrollment exists yet for Vermont. These unpaired discovery observations are not a published preflight receipt.
