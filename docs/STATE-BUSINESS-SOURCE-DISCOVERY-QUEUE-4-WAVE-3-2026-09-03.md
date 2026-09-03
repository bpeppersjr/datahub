# State Business Source Discovery — Queue 4, wave 3

Date: 2026-09-03

Scope: VT, WV, ND, DC, AK. Three independent state workers researched Vermont, West Virginia, and North Dakota while the root worker evaluated the District of Columbia and Alaska. This completes official-source discovery for the 13 jurisdictions left outside Queues 1–3.

No account was created, agreement accepted, purchase made, complete source downloaded, portal enumerated, access control bypassed, source release published, or production pointer changed. One Alaska response stream was canceled after 81,616 bytes without saving a file; only its header was used and subsequent streamed bytes were discarded. D.C. requests were metadata, aggregate-count, or distinct-value queries and did not retrieve or persist individual entity rows.

The machine-checkable companion is `config/state-business-source-discovery-queue-4-wave-3.json`. `npm run state-source-discovery:check` validates all three waves, exact decisions, coverage arithmetic, evidence, privacy exclusions, authorization boundaries, and remaining gates.

## Decision

| Rank | State | Current profiles | 2023 nonemployer baseline | Diagnostic gap | Official candidate | Decision |
| ---: | :---: | ---: | ---: | ---: | --- | --- |
| 1 | VT | 11,833 | 65,028 | 53,195 | weekly full Business Services download | **HOLD** — current access and data contract undocumented |
| 2 | WV | 42,791 | 94,681 | 51,890 | Business Organizations Database | **HOLD** — paid contract, price conflict, unsafe person tables |
| 3 | ND | 17,759 | 60,342 | 42,583 | All Business and Trademark Records | **HOLD** — paid delivery without automation/change/rights contract |
| 4 | DC | 53,407 | 64,986 | 11,579 | Corporate Registration Open Data table | **PROCEED TO BOUNDED CONNECTOR** — no full acquisition or production admission |
| 5 | AK | 101,859 | 61,337 | -40,522 | CorporationsDownload.csv | **PROCEED TO BOUNDED CONNECTOR** — no full acquisition or production admission |

The Census nonemployer baseline is a different source universe and year. These gaps rank acquisition work only. Alaska's existing statewide license-scoped evidence exceeds that baseline; the 166.1% ratio demonstrates why it cannot be called business completeness.

## Vermont

Official 2025 [Secretary of State testimony](https://legislature.vermont.gov/Documents/2026/Workgroups/House%20Energy%20and%20Digital/Data/W~Lauren%20Hibbert~Transparency%20and%20Accessibility%20of%20SOS%20Data~4-29-2025.pdf) describes a free, weekly updated full dataset. The current [bulk-download route](https://bizfilings.vermont.gov/bulk-download) requires sign-in, and no official source publishes the schema, exact scope, count, as-of time, corrections, tombstones, checksums, or unattended-access rules. The portal's Record Number is only a candidate key.

Vermont law distinguishes active from good standing and permits retroactive reinstatement under [11A V.S.A. §14.20](https://legislature.vermont.gov/statutes/section/11A/014/00014.20) and [11 V.S.A. §4034](https://legislature.vermont.gov/statutes/section/11/025/04034), so source status and correction history cannot be flattened. The source can contain agents, directors, officers, organizers, members, owners, partners, sole proprietors, and their addresses. Exclude every registered-agent name, email, and address field, including organization agents. Request a person-free sample/data contract, access terms, and explicit retention and derived-publication rights before creating an account.

## West Virginia

The official [bulk specification](https://apps.wv.gov/sos/bulkdata/Content/BED_FileInformation.pdf) describes one package of nine files. The corporation file says it contains all organizations but lacks an explicit status field; termination dates cannot distinguish good standing from active noncompliance. The separate address file is officer/contact data and must not be ingested.

The full database is listed at $12,000, while current statute, a 2026 order form, and the resale contract conflict on recurring price. Commercial resale requires a written contract, and the original bulk format cannot flow downstream. Request the current executable contract, present schema/codebooks, exact scope and active predicate, person-free organization-address option, monthly reconciliation mechanics, controls, automation method, and entity-only derived-publication rights before any account or purchase.

## North Dakota

The [Data List Requests](https://www.sos.nd.gov/services/data-list-requests) page offers all active and inactive business and trademark records for $1,440 per month through FirstStop. Official samples expose 44 fields and `SOS_CONTROL_ID`, but no published guarantee connects that key's full lifecycle to the portal's system ID. Status, annual-report standing, and registered-agent standing are separate dimensions.

Delivery is authenticated Excel with no public API, unattended-access rule, as-of time, full/delta/tombstone/replay contract, manifest, checksum, or derived-use license. The product mixes trademarks and person-bearing registered-agent and owner data. Request a business-only organization projection, complete type/status/key definitions, delivery mechanics, and written retention/publication rights before creating an NDLogin or purchasing.

## District of Columbia

The DLCP reading room identifies [Corporate Registration](https://opendata.dc.gov/datasets/DCGIS::corporate-registration/explore) as official open data. Its [ArcGIS table](https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Business_Licensing_and_Grants_WebMercator/FeatureServer/0) publishes a no-geometry schema, supports pagination, and currently reports 503,371 rows: 115,318 `Active - In Good Standing` and 151 `Active - Not in Good Standing`. The latest observed source-modification value was 2026-09-03T11:53:39Z. [District data terms](https://beta.dc.gov/terms-and-conditions-use-district-data) say CC0 unless otherwise noted, while current catalog metadata has also identified CC BY 4.0; the connector therefore preserves the conservative attribution and version-note requirements.

The selected projection must exclude email and every registered-agent field. File Number remains a candidate source key until repeated releases prove its behavior. `Business Address` is administrative evidence, not a site. A bounded metadata/count preflight and offline organization-only conformance path, including a checksum-verified non-overwriting local-review release, are authorized; a full selected-row download, live-source-derived release, registry integration, coverage publication, Heatmap Builder admission, and pointer change are not.

## Alaska

The Alaska CBPL directly serves an official `CorporationsDownload.csv` from its Search & Database Download system. A HEAD request reported `text/csv`, 44,309,498 bytes, and filename `CorporationsDownload.csv`. A bounded stream was canceled after the first 81,616 bytes without saving a file. It confirmed a 35-column layout containing entity identity/status/type, administrative entity mailing/physical addresses, and registered-agent data.

The person-free selection must exclude `REGISTEREDAGENT` and all registered-agent address columns, as well as business-name registration alias rows. Preserve entity mailing and physical addresses only as administrative evidence, with ZIP5 and ZIP+4 separate; never create an operating site, geometry, geocode, owner, or current-operation claim. The [corporations page](https://www.commerce.alaska.gov/web/cbpl/corporations) and [public-records page](https://www.commerce.alaska.gov/web/cbpl/PublicRecordsRequests.aspx) do not publish cadence, full snapshot/change semantics, checksums, or derived-publication terms. A bounded connector and offline fixture are authorized, but downloading the complete 44.3 MB file is not.

## Shared boundary

The three `HOLD` states require a written data contract before implementation. Alaska and D.C. may proceed only through preflight and offline fixtures. All five remain excluded from production until their exact remaining gates close and explicit acquisition/cutover authority is recorded. Business records may carry only address-associated latitude/longitude; no business entity may receive geometry. ZIP5 and ZIP+4 remain separate.
