# CMS Hospital General Information: metadata-only source contract

Status: research complete; connector, acquisition and dataset publication are not implemented or dispatched by this note. On September 12, 2026, searches of `runner`, `config`, `docs` and the retained business-source directory found no Hospital General Information/Care Compare connector or hospital-specific retained release. Existing `cms-nppes-organizations` is a different source and does not satisfy this feed.

## Official source and observed metadata

CMS Provider Data Catalog dataset identifier is `xubh-q36u`; title Hospital General Information. The metadata describes Medicare-registered hospitals. Direct metadata GET returned HTTP 200, 1,215 bytes, SHA-256 `31eea397b8bfe8207168cefda23256eb9cb3d5e49158d221eda8465a2d8e5f8c`, under a 1 MiB/30-second/no-redirect bound. Metadata dates: issued `2025-01-08`, modified `2026-07-22`, released `2026-08-13`; public access; publisher CMS. These are distinct dates, not individual-facility operating-status timestamps. No semantic release version or data-byte checksum is supplied in that response. [Official metadata endpoint](https://data.cms.gov/provider-data/api/1/metastore/schemas/dataset/items/xubh-q36u).

The catalog advertises 5,419 rows and 38 columns. This is a publisher display count, not a verified downloaded count or unique-business total. Its unfiltered page was consulted through indexed metadata; no datastore query was issued. [Dataset catalog](https://data.cms.gov/provider-data/dataset/xubh-q36u).

The exact distribution URL advertised by the observed metadata is:

`https://data.cms.gov/provider-data/sites/default/files/resources/893c372430d9d71a1c52737d01239d47_1785189955/Hospital_General_Information.csv`

Media type is `text/csv`. No request was sent to that URL; content length, content hash, actual header order, state allocation, identifier uniqueness and CSV parsing remain unverified. The path token is not a proven checksum or stable version identifier.

## Fields and identity boundary

The July 2026 hospital dictionary, pages 20–21, lists Facility ID as six-character text, Facility Name, Address, City/Town, State, ZIP Code, County/Parish, Telephone Number, Hospital Type, Hospital Ownership, Emergency Services, birthing-friendly designation, rating and quality-measure counts/footnotes. It warns against spreadsheet removal of leading zeros. Its ZIP numeric display type must not cause postal identifiers to become numbers. A separate VA general-information file appears elsewhere in the dictionary; do not infer this single file covers every hospital universe. [Official hospital dictionary](https://data.cms.gov/provider-data/sites/default/files/data_dictionaries/hospital/HOSPITAL_Data_Dictionary.pdf).

Proposed first projection: source-native facility identifier/name, reported address components, reported hospital type/ownership category, emergency-services source value, source lineage and policy. Exclude telephone and quality metrics initially. Do not turn ownership category into a named parent company. Keep ZIP5 and ZIP4 separate and nullable; preserve original postal text for validation rather than padding/truncating an unverified value. No latitude/longitude columns were documented for this file; points remain null until a separate authorized geocoding process. County text is not Census membership.

Use provisional identifier type `cms-pdc-hospital-facility-id` until a reviewed dataset-specific mapping establishes a stronger CCN interpretation. This dictionary labels Facility ID but does not itself define an NPI relationship. Never copy it into NPI, infer an organization identity, deduplicate physical campuses from it, or merge with NPPES by name alone. Duplicate-ID behavior is an acquisition validation question, not permission to discard rows.

National source scope means the CMS directory universe, not complete coverage of every hospital, healthcare business or all 50 states. Exact territories and out-of-scope rows were not measured. Preserve them separately when eventually observed. Emergency Services is a source attribute, not a general open/closed flag; neither directory inclusion nor ratings establish current operations. Facility, organization, campus and establishment units remain distinct.

## Use and transport contract

CMS's hospital-specific notice permits reuse of U.S. government works and requests attribution; presenting the data or ratings as government endorsement is prohibited. This is strong public reuse evidence, not a claim about rights in every third-party material or an app acquisition authorization. Capture notice URL/hash in the connector policy and initially keep newly normalized outputs local-review-only until the field projection is reviewed. [Hospital data-use notice](https://data.cms.gov/provider-data/topics/hospitals/about-data).

CMS documents no API-key requirement and identifies dataset IDs as persistent across refreshes, while distribution IDs change. The recommended API form is `/provider-data/api/1/datastore/query/{datasetID}/{index}`, distribution index zero. Its FAQ says batches are limited to 1,500 in one section but still says 2,000 in another. Do not hardcode either as a proven server limit. CMS reports no rate restriction, but that is not a reason for high concurrency. [Official FAQ](https://data.cms.gov/provider-data/about/faq); [API specification entry page](https://data.cms.gov/provider-data/docs).

No provider-row API requests, CSV download, credential exchange, agreements, acquisition dispatch or production writes were performed. Metadata/doc requests do not establish a tested row-query or pagination contract.

## One bounded next implementation

Build a standalone metadata-preflight plus synthetic CSV-conformance contract, proposed files `runner/cms-hospital-general-information.mjs`, tests, connector/dataset/schema/source-policy JSON and CLI. Do not register a live schedule yet. Use one provider budget key `cms-provider-data-catalog` and one national acquisition in the eventual app workflow; derive all state views locally from the same immutable artifact, never 50 repeated downloads.

Suggested internal limits, not publisher guarantees: one request at a time; metadata 1 MiB/30 seconds; future CSV 20 MiB/60 seconds and 25,000 rows; total job deadline 180 seconds. Preflight must confirm public identifier/title/publisher/dates and exact HTTPS CMS distribution path. Reject redirects, unexpected hosts, schema drift and cap breaches. Pin metadata and notices, then require before/after metadata stability around any later approved CSV download. A later source update changes the retained release identity; it does not overwrite history.

Fixture acceptance: leading-zero IDs/ZIPs, nullable separate ZIP4, CSV quoting/BOM, duplicate/blank IDs with explicit quarantine or rejection, 38-column advertised schema versus selected projection, unknown type/status values preserved without operation claims, outside-state accounting, row/count conservation, bounded parsing, cancellation, no partial published manifest, checksum replay and no public-export escalation. No live CSV is needed to implement these prerequisites. The next native step after review is a bounded metadata/header-and-count contract validation or one explicitly authorized CSV acquisition—not an unbounded API experiment.

Remaining unknowns: actual bytes/header/rows and jurisdiction distribution; facility-ID uniqueness and scope; exact CCN/campus relationships; refresh cadence/SLA; latest download hash; API pagination consistency. These do not negate documented public access, but must remain visible rather than guessed.
