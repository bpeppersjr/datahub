# Retained hospital address enrichment: feasibility and next contract

Status: documentation-only audit, 2026-09-12. No addresses, names, identifiers, or source rows were submitted externally. Only official documentation and the benchmark catalog were read. No implementation, native geocoding proof, source-policy approval, or app-owned runnable operation is claimed.

## Existing seam

`runner/google-places.mjs` resolves ZIP/country strings to Google postal-area Place IDs; its field mask requests only `results.placeId,results.types`. It is not an address-to-point service. Do not repurpose its paid/API-key workflow or infer hospital points from ZIPs. `runner/business-map-store.mjs` consumes existing location coordinates; `runner/census-geography.mjs` supplies geography, not address geocoding.

Start from `verifyCmsHospitalAcquisition` in `runner/cms-hospital-acquisition.mjs` and its verified selected artifact, not the restricted raw CSV. Reuse stable/hash IO from `runner/mn-construction-retained-selection.mjs`, cancellation from `runner/cli-cancellation.mjs`, and the acquisition lifecycle's immutable run, exclusive source lease, bounded cleanup, and independent replay patterns. Do not change the CMS receipt or turn its source address into an asserted operating establishment.

## Provider contract and unresolved gates

The point-only endpoint is multipart POST `https://geocoding.geo.census.gov/geocoder/locations/addressbatch`, with `addressFile` and explicit `benchmark`. CSV has opaque ID, street, city, state, ZIP; blank components retain columns. ID and street are required. Puerto Rico urbanization uses a sixth column. Maximum batch size is 10,000 records. Geography `vintage` is unnecessary for this point-only operation. `Current` changes over time; benchmark names are not immutable underlying-data pins. [Official API documentation](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html).

The current guide also specifies a 5 MB batch-file limit and describes output identity, input/matched address, match indicator/type, interpolated longitude/latitude, TIGER line ID and side. Coordinates are approximate interpolation along potential address ranges, not rooftop validation; a possible address need not contain a structure. [May 2026 user guide](https://www2.census.gov/geo/pdfs/maps-data/data/Census_Geocoder_User_Guide.pdf).

The older official FAQ explicitly identifies NAD83 and longitude X/latitude Y. The current documents reviewed did not establish its realization or a WGS84 transformation. Preserve provider datum and documentary basis; do not silently label outputs EPSG:4326. Resolve the map-coordinate transformation contract before display adoption. [Official legacy FAQ](https://www2.census.gov/geo/pdfs/maps-data/data/FAQ_for_Census_Bureau_Public_Geocoder.pdf).

`Match`, `No_Match`, and `Tie` are distinct outcomes; commercial addresses can fail. Processing load can affect matching yield. Census discourages whole-batch resubmission and discusses unmatched-only processing; this does not authorize app retries. [Current FAQ](https://www2.census.gov/geo/pdfs/maps-data/data/Census_Geocoder_FAQ.pdf).

The metadata-only [benchmark catalog](https://geocoding.geo.census.gov/geocoder/benchmarks) observation listed Current (4), ACS2025 (8), LUCA (11), and Census2020 (2020). Select a reviewed public benchmark explicitly, never the default flag or LUCA by inference. Persist catalog bytes/hash, chosen ID/name, and observation time before/after processing; catalog equality cannot prove unchanged address-range contents.

No Geocoder-specific requests/second, concurrency quota, or SLA was located in the reviewed documentation. Do not borrow Census Data API limits. No reviewed source establishes a batch-upload retention/deletion guarantee; the general [online privacy policy](https://www.census.gov/about/policies/privacy/privacy-policy.html) is not such proof. Public CMS reuse permission alone does not establish approval for outbound address disclosure. A separate policy must cover disclosure, provider retention uncertainty, attribution, local retention, and redistribution before native execution.

## Minimal implementation proposal

First add `runner/census-geocoder-batch-contract.mjs` and its test, plus `config/source-policies/census-geocoder-public-addresses.json`: offline planning/CSV parsing only. Then add a bounded session/independent verifier and `scripts/geocode-retained-addresses.mjs`; managed-operation registration follows verified lifecycle tests, not an agent-held process.

Plan an explicit retained cohort. Preserve original addresses unchanged locally. Submit only a run-scoped opaque ID and address components: no facility name, CMS/source ID, phone, or other fields. Maintain a private local row mapping; repeated addresses remain separate source assertions. Missing or unsupported address structure stays ineligible with a reason, without invented urbanization, city, or ZIP. Do not silently rewrite units or source text.

Proposed conservative app limits, not provider guarantees: one source-wide session, one batch POST per initial run, at most 10,000 rows and 5,000,000 upload bytes; 20 MiB response, 180-second POST, 240-second total session, one-second cleanup. Catalog GETs have separate small byte/time caps. Fixed HTTPS host/path, no redirects, no automatic retries. A timeout after submission has unknown provider completion; retain inspection-required intent/lease if local transport cleanup is unverified. A later unmatched-only run needs an explicit new plan; never overwrite an earlier receipt.

Publish a separate geocode assertion containing input pins, original/submitted address linkage, raw status/type, matched address, longitude/latitude, datum basis, interpolation method, benchmark metadata, observation time, and request/response hashes. No numeric confidence invented from Exact/Non_Exact. Reconcile every planned row into ineligible, matched, unmatched, tie, or unresolved. Unknown statuses or duplicate/missing/extra IDs fail validation, not become points. Preserve restricted raw response and mapping internally; allowlisted derived output is local-review until export policy is approved. No business totals, site deduplication, county assignment, polygons, current-operations claim, or ZIP-centroid fallback.

Acceptance fixtures: quoting/leading-zero ZIPs and Puerto Rico layout; repeated addresses with distinct IDs; exact/non-exact/unmatched/tie; unknown and duplicate IDs; invalid coordinates/order; all count conservation; source/policy/benchmark drift; upload/response/deadline bounds; caller abort and actual timer expiry; noncooperative cleanup and lease ownership; manifest-last publication and independent hash/row replay. Native sample submission, CRS adoption, and UI integration remain separately gated and unexecuted.
