# Vermont childcare discovery — September 8, 2026

## Outcome

Subsequent root work validated fresh catalog metadata and anonymous aggregate delivery; see [the dated follow-up](VT-CHILDCARE-METADATA-2026-09-08.md). The observations below describe the initial discovery phase only, not the later API results.

An official monthly childcare dataset and its API documentation were identified, but a center-only, current-snapshot acquisition contract has not yet been validated. No provider rows, identifiers, aggregate queries, exports or bulk downloads were requested. No account, token, paid access, consent or access workaround was used.

The scoped repository search found Vermont Secretary of State discovery/revalidation entries, not an existing childcare connector. Those business-registry restrictions must not automatically be applied to this different publisher and dataset.

## Official source chain and observed metadata

The indexed [DCF Child Care Provider Data page](https://dcf.vermont.gov/cdd/data/providers) identifies a monthly provider dataset, including capacity, accreditation and statuses. It separately describes a locations/contact dataset as containing mailing/contact information. Consequently, an address column must not automatically be represented as verified physical premises. A direct browser retrieval of this DCF page returned HTTP 403; it was not retried or accessed through an alternate transport. The publisher-page claims here come from its search-index representation, not a retained fresh HTTP metadata receipt.

The [Socrata API Foundry record for ctdw-tmfz](https://dev.socrata.com/foundry/data.vermont.gov/ctdw-tmfz) identifies “Vermont Child Care Provider Data,” domain `data.vermont.gov`, owner Child Development Division Data Unit, attribution to DCF Child Development Division, and Open Database License. Indexed metadata reports July 31, 2026 at 7:10:38 PM as last update; timezone was not established. Its description says monthly updates reflect programs in business on the final day of the preceding complete month. Do not infer today's operational status.

The same documentation identifies `file_name` as tracking reporting period; `license_type` and `provider_program_type` as text; `current_license_end_date` as a floating timestamp; and `address_1` as text. Crucially, Licensed includes afterschool, center-based and licensed family-home programs. It is not a sufficient center-only predicate. The documented API v3 query URL is `https://data.vermont.gov/api/v3/views/ctdw-tmfz/query.json`; examples require an application token. This endpoint was not invoked. A direct documentation-page open produced only a generic shell, while targeted search returned its indexed descriptions. No anonymous delivery success is claimed.

## Privacy, license and currentness prerequisites

- Validate exact `provider_program_type` literals and licensing/status meanings using publisher metadata and a bounded aggregate, when an authorized anonymous interface is established. Exclude registered and licensed family homes; do not use `license_type` alone.
- Determine whether multiple monthly files coexist and what makes a complete current cohort. Preserve source reporting period separately from source modification, observation and processing timestamps. Do not deduplicate historical rows merely by provider or license ID.
- Establish a selected field roster for facility name, typed identifiers, reported address, separate postal parts and optional coordinates. No ZIP field type, coordinate datum, stable key, count or physical-address meaning was verified in this investigation. Exclude mailing/contact and personal fields unless specifically necessary and governed.
- Retain the exact dataset license link and full applicable notice. Open Database License is a substantive license label, not “public domain”; attribution and potential database-sharing conditions need a source-specific policy. No legal approval or automatic prohibition is inferred from the label.
- Verify a documented anonymous metadata/count delivery route before implementing a success-capable preflight. Do not invent a legacy endpoint, create a token/account, or follow the denied DCF surface to obtain records. If public documentation establishes an anonymous route, use it with fixed endpoints and bounded requests; public internal candidate data does not need an invented universal approval hold.

## Next implementable step

Obtain fresh, sample-free catalog metadata and the exact license notice through a publisher-documented public interface. Then validate program-type/status and reporting-period aggregates without provider rows. The resulting evidence should determine the exact center predicate and latest-complete-period selector before any app-owned acquisition engine is enrolled. The existing CT/PA Socrata lifecycle may be reusable after these source-specific contracts are established, but is not evidence of Vermont access or compatibility.

No configuration, source code, app operation, source release or national reporting enrollment changed.
