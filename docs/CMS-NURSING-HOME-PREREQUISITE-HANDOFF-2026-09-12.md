# CMS nursing-home Provider Information: national prerequisite handoff

Documentation/metadata audit only, September 12, 2026. No CSV, ZIP bundle, facility rows, or address submissions acquired. No implementation or native acquisition readiness claimed.

## Subsequent offline implementation

The audit above preceded the now-implemented isolated `runner/cms-nursing-home-prerequisite.mjs`, focused test, and separate source policy. `inspectCmsNursingHomeMetadata` validates bounded caller-supplied metadata and preserves the exact dated publisher active-directory assertion; `inspectCmsNursingHomeCsvForConformance` projects caller-supplied CSV with 32 MiB / 25,000-row / 128-column / 64 KiB-record limits. All metadata/CSV outputs remain explicitly offline, transport unverified and acquisition not ready. No live bytes were fetched for these tests.

Ten focused tests pass, including byte/row/column/record caps, selected-header strictness, CCN/ZIP preservation, duplicate rejection, all coordinate eligibility states, unknown-field exclusion, metadata drift, pre-abort and cooperative decoding cancellation. ESLint passes on both owned modules. Transport timers, source leases, artifacts, native replay, managed handoff and runtime are not implemented or tested by this prerequisite. The source policy is declarative offline policy, not a native access approval. Existing hospital files are unchanged.

## Reuse before acquisition

Targeted searches of main `config`, `runner`, and `docs` found no Provider Information / `4pq5-n9py` adapter or selection. The top-level retained `data/business-sources` inventory contains CMS hospital and NPPES sources, but no nursing-home source. This is a bounded catalog/inventory check, not an exhaustive disk search. Hospital `xubh-q36u` and NPPES evidence do not substitute for this directory. Acquire one national release, then derive all reported-state buckets locally; do not issue separate state downloads.

## Exact observed source

[CMS dataset metadata](https://data.cms.gov/provider-data/api/1/metastore/schemas/dataset/items/4pq5-n9py) identifies `4pq5-n9py`, title `Provider Information`, publisher CMS, access level public, issued `2026-02-01`, modified `2026-08-01`, released `2026-08-26`, planned next update `2026-09-30`. It describes one row per nursing home in the publisher's currently-active directory. This is a dated publisher assertion, not independently verified current operations.

One `text/csv` distribution was observed:

`https://data.cms.gov/provider-data/sites/default/files/resources/328596835e6db31b2564cd733c3795f4_1786724150/NH_ProviderInfo_Aug2026.csv`

This URL was read from metadata, not fetched. No CSV byte count, hash, header replay, row conservation, or actual geographic coverage is established. Search-index versions of the [catalog page](https://data.cms.gov/provider-data/dataset/4pq5-n9py) show differing refreshes/counts; do not use cached displayed counts as a pin or completeness test. Retain and hash bounded native metadata at future execution rather than inventing a hash from browser rendering.

## Selected schema and coordinate quality

The July 2026 [CMS consolidated dictionary](https://data.cms.gov/provider-data/sites/default/files/data_dictionaries/nursing_home/NH_Data_Dictionary.pdf), Table 2, documents six-character alphanumeric CCNs and the following proposed narrow projection: `CMS Certification Number (CCN)`, `Provider Name`, `Provider Address`, `City/Town`, `State`, `ZIP Code`, `County/Parish`, `Ownership Type`, `Provider Type`, `Legal Business Name`, `Latitude`, `Longitude`, `Geocoding Footnote`, `Processing Date`. Preserve CCN as typed `cms-certification-number`, never numeric/NPI/canonical business ID. Preserve ZIP lexical values and raw source address.

Dictionary Table 15 footnote 22 means coordinates are based on ZIP because the street address could not be matched. Retain this as a ZIP-based estimate, never a facility point. Other coordinates remain publisher-estimated, not independently verified rooftop locations; unknown footnotes must remain unresolved. Datum/realization and geocoding method beyond this distinction were not established. Missing/invalid coordinate pairs remain explicit; no external geocoder or county assignment is implied. Ratings, staffing, telephone, chain and enforcement fields stay outside the initial selected projection.

Proposed eligibility states (application classifications, not claimed CMS status codes):

| Input condition | Retained assertion | Facility-point eligibility |
|---|---|---|
| Valid pair, footnote `22` | `publisher-zip-based-estimate` | False |
| Valid pair, blank footnote | `publisher-estimate-quality-unspecified` | Pending CRS/method review, not automatically true |
| Valid pair, other footnote | `unresolved-footnote` with original value | False pending review |
| Both coordinates absent | `missing-coordinates` | False |
| One absent, nonnumeric/nonfinite, or out of bounds | `invalid-coordinate-pair`, raw preserved | False |

Table 15 documents only code 22 specifically for geocoding; its other codes concern ratings, quality, staffing, or reporting periods, not additional geocode success statuses. Blank footnote is not documented proof of an exact match. Preserve footnotes even when coordinates are missing. Never coerce missing coordinates to zero or discard affected directory rows.

## Policy and bounded workflow

The [CMS reuse FAQ](https://data.cms.gov/sites/default/files/2022-12/API%20FAQ%20%20v1_1.pdf) allows general government-data reuse, requests attribution, forbids implied endorsement, and warns that some datasets have additional agreements. Reuse the already reviewed notice artifact only after independently verifying its retained hash; create a separate nursing-home policy profile. Initially retain raw data internally and selected rows local-review-only, public export false. This audit is not legal clearance or authorization to acquire.

Smallest next files: `runner/cms-nursing-home-prerequisite.mjs` and `.test.mjs`, `config/source-policies/cms-nursing-home-provider-information.json`, followed separately by a session/CLI and independent verifier. Reuse the contracts in `runner/cms-hospital-prerequisite.mjs`, bounded transport/lease/manifest-last patterns in `runner/cms-hospital-acquisition.mjs`, stable IO in `runner/mn-construction-retained-selection.mjs`, and `runner/cli-cancellation.mjs`. Do not broaden or rewrite hospital pins.

Proposed app ceilings, not provider quotas or measured file size: metadata 1 MiB/30 seconds, dictionary 5 MiB/30 seconds, notice 1 MiB/30 seconds, CSV 32 MiB/90 seconds; five sequential requests (metadata, dictionary, notice, CSV, metadata), total 40 MiB/240 seconds, no redirects/retries, one-second bounded cleanup. Maximum 25,000 rows, 128 columns, 64 KiB logical record. Share the CMS provider budget key; no overlapping CMS jobs or automatic stale-lease takeover. Unknown cleanup ownership requires inspection. If retained notice/dictionary reuse is approved, explicitly record those dependencies and reduce the planned network itinerary.

Before CSV access validate exact dataset/publisher/public access, date order, sole expected distribution and dictionary URL, strict HTTPS host/resource path, reviewed policy and notices. Preserve completed restricted evidence on failure, publish success manifest last, and independently replay CSV-to-selected membership plus before/after metadata stability. Native execution and app-managed registration are separate review gates; the prerequisite adapter alone is not an app-owned runnable handoff.

## Acceptance and downstream boundary

Offline tests must cover wrong dataset/URL/policy, drift, invalid UTF-8/CSV, exact selected headers with unknown columns counted only, duplicate/blank CCNs, alphanumeric IDs and leading-zero ZIPs, footnote 22 and unknown/missing coordinate quality, source-row conservation, bounded caps, actual deadline/caller cancellation, uncertain cleanup, and independent manifest/hash replay. Do not silently deduplicate source rows or label duplicate identifiers unique businesses.

Later retained reporting must conserve every accepted row across 50 states, D.C., territories and unknown states; use fixed cohort denominators, not national-completeness percentages. Preserve source dates and observed time separately. Business/site/current-operating counts, identity joins, point display, and production enrollment remain unverified until their own contracts and tests. No bulk download is needed merely to implement these offline prerequisites.
