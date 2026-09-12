# Retained hospital-address Census geocoding

Source-specific bounded implementation. One root-authorized native run on September 12 ended with an unresolved POST outcome; the retained failure and provider quarantine are documented below. No geocodes were published. This is not broad production readiness, app-managed registration, a coverage publication or authorization to retry.

## Policy assessment

The fixed retained CMS Hospital General Information metadata declares public access and describes hospital address data. The retained CMS API FAQ, SHA-256 `6c45ef1ccb69bd3da4652769254472555bb83a87e8885d6c144e271cb0f53244`, was rehashed; complete rendered page 5 was reviewed with the PDF skill. It supports general government-work reuse with attribution, while explicitly preserving dataset-specific licensing exceptions and forbidding implied government endorsement. This is the same source notice already enforced by the retained acquisition verifier, not a newly invented permission document. [CMS notice](https://data.cms.gov/sites/default/files/2022-12/API%20FAQ%20%20v1_1.pdf).

The [official Census API documentation](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html) describes public batch submissions and address-range calculated coordinates. This supports implementing the limited public-address workflow without a credential gate. The attempted [general privacy-policy page](https://www.census.gov/about/policies/privacy/privacy-policy.html) read timed out. No provider upload-retention, deletion or confidentiality guarantee is claimed. Even general website privacy language would not establish a batch-file retention guarantee. Assessment scope is only this already-public CMS hospital-address cohort, not arbitrary user, clinical, personal-owner or licensed datasets. Native dispatch remains separately held for root review.

Compiled policy `cms-hospital-census-geocoding@1.0.0` permits only opaque run-scoped UUID, street, city, state and ZIP5 outbound. Facility names, CMS/source identifiers, phones, ZIP4, county, ownership and clinical fields never enter the upload. The private mapping preserves original street/city/state and separate ZIP5/ZIP4 with source-record linkage. Mapping and response are internal; derived assertions are local-review-only, never public export. CMS and Census attribution remains explicit. Dataset-specific restrictions or fixed evidence drift fail before submission, rather than inventing new access credentials.

## Fixed evidence and eligibility

The native wrapper accepts cancellation only. It fully replays the fixed 5,419-row hospital source through the existing reporting/acquisition verifier: manifest `856992891a8ded15d0f924169991cd3c7d0bda6112de1a0702dd5600305e9239`, selected `30cb62fac6c3c9a52e9cdba31423a138b65945beb8321cb48f3825f8506bb979`. It also replays the retained public-demo manifest `6763d425b5126c6e09cf800ddf0dc6aa20d024c9b570bc0d7cce774b59157827`. No copy, refresh or repeat demo POST is performed. Input evidence keeps source, acquisition, demo and geocoder request clocks distinct.

Each original row remains represented. Missing street and unsupported/missing state are explicit ineligibility reasons; supported address layout is 50 states/DC/PR with five CSV fields. The source supplies no separate urbanization/municipio fields: neither is guessed. Other territories remain ineligible without a reviewed layout. Repeated addresses get distinct opaque IDs. A complete response must reconcile every submitted ID exactly once; missing, duplicate, extra and unknown IDs fail. Responses can reorder rows; derived output returns source order. ZIP4 remains separate and unsent. Source addresses are never normalized in place.

An actual network-disabled local assessment reverified the source and demo and constructed only an in-memory upload: **5,419 rows, 5,413 eligible, 6 ineligible**, all six unsupported/missing-state bucket; **470,776 CSV bytes**, no nonnull ZIP4 in this retained edition. No address values were logged and no upload/artifact was published. These are cohort observations, not permanent eligibility invariants or business/site counts.

## Lifecycle and ownership

`geocodeRetainedCmsHospitals({signal?})` / argument-free `scripts/geocode-cms-hospitals.mjs` use the existing CLI cancellation helper, including IPC cancel. Native jobs reside in `data/business-sources/cms-hospital-census-geocoding/jobs/<UUID>`. The lease is exactly the existing demo provider lease `data/business-sources/census-public-geocoder/.source-lease`; the demo and hospital workers cannot overlap. There is no stale takeover. Exact owned payload and file identity are checked before lease removal; changed markers remain untouched.

Fixed itinerary: catalog GET, **one** multipart POST to `/geocoder/locations/addressbatch`, catalog GET. Explicit `8 / Public_AR_ACS2025` must exist uniquely; no default/fallback. Before/after catalogs must be byte-identical, which does not prove an immutable underlying address-range release. Limits: 5,419 rows, 1 MiB CSV, 1 MiB + 4 KiB multipart, 4 MiB POST response plus two 64 KiB catalogs; 30 seconds each GET, 90 seconds POST, 180-second session, 1-second cleanup. Redirects, retries and credentials are disabled. A zero-eligible synthetic cohort can be represented by the pure contract, but lifecycle refuses an empty submission before POST.

Policy and fixed source/demo are checked initially and again immediately before external POST, after local preparation and request intent; policy is checked after the potentially longer source replay. Durable run intent, mapping, CSV, exact multipart and per-request intent precede submission. Every completed bounded raw response is preserved before status/header/schema validation; oversized header values become safe diagnostics. Raw status/bytes/hash/timestamps are retained on failure. Unknown/incomplete POST outcome or unresolved cleanup retains the provider lease and returns inspection-required; a completely received malformed response alone does not hold the lease forever. No automatic retry follows either case.

Success publishes a manifest last via exclusive link and independently replays the completed output. The verifier checks exact mode/root/roster, source/demo evidence, mapping against original rows, upload/multipart bytes, catalog/benchmark, request ordering/status/bounds, response membership/variants, exact derived rows and count conservation, then replays source again and rechecks every output file identity/hash and directory owner. The verifier has its own fixed 180-second cooperative deadline. Post-publication errors and lease cleanup failures preserve the manifest identity and force inspection. Failed output is retained internally, never relabeled successful or silently overwritten.

File reads and parsers are bounded and cancellation-aware; deadlines are cooperative, not OS-enforced filesystem timeouts. Contract planning is bounded synchronous work over at most 5,419 rows. Response decoding and parsing yield; caller abort/timer expiry prevents a successful result. Native-source authenticity rests on app-owned retained evidence and independent replay, not a digital signature against an adversarial local writer.

## Result meaning and worker handoff

The native demo proved one eight-field Match/Exact response. This workflow records each actually observed accepted status/arity/type separately; it does not arbitrarily block all unobserved No_Match/Tie variants before submission. An unexpected actual schema fails with raw evidence retained. Candidate accepted Match has eight fields; No_Match/Tie have three through eight fields with empty tails. Full ID conservation remains mandatory. No result claims all possible service/PR variants verified.

Every row yields matched, unmatched, tie or ineligible; nonmatches have null coordinates. Points retain NAD83, unknown realization, longitude-X/latitude-Y and address-range interpolation. They are not rooftop, canonical site, operating business, county/ZIP polygon assignment or WGS84-transformed points. Exact/Non_Exact is publisher match type, not an invented confidence percentage. Existing CMS selected artifacts/geocodes are unchanged.

The application worker seam is the fixed CLI plus immutable manifest descriptor or inspection-required failure descriptor. Native API accepts no address/source/output override. Run/response/mapping remain operation-owned and local; managed API registration, map adoption, public export and broader production integration are separate. The next authorized step after review is a single bounded fixed-cohort dispatch, not a new demo or a state-by-state series.

Fixture namespaces include process ID, preventing cross-process full-check collisions while retaining one physical shared demo/hospital provider lease within a process. Native paths are unchanged. Tests cover reordered/duplicate/missing/unknown UUIDs, ineligible territory retention, ZIP4 exclusion, source/policy drift including final pre-POST interval, public-demo lock contention, response caps, noncooperative fetch/read/cancel, publication/changed-lease recovery and rehashed output tamper. A real 30-second GET timer returned in approximately 31 seconds with uncertainty retained; the 90-second POST timer was not separately allowed to expire in fixtures. The later native attempt below reached its POST deadline.

Combined concurrency-4 validation: 32/32 passed across the unchanged native demo behavior, new hospital contract and lifecycle, including local retained-only input assessment. Both 30-second timers completed within a total approximately 34-second suite, demonstrating independent fixture processes rather than serial provider-lock collision. Owned-file lint and whitespace checks passed. Whole-application checks and any native dispatch remain the integrator's responsibility.

## Native unresolved attempt and byte-identical quarantine adoption

Root dispatched committed implementation `9f2f5aa` exactly once: run `b2473d79-39d8-4aa9-90ee-251cd2d3a374`, created `2026-09-12T15:15:27.059Z`, failed `2026-09-12T15:16:57.761Z` (90,702 ms). The catalog GET returned HTTP 200 and 547 bytes. The POST intent started `15:15:27.748Z`, declaring 471,098 multipart bytes; failure followed 90,013 ms later. There is no completed POST response, second catalog, success manifest or geocode artifact. This proves a bounded local timeout/inspection outcome, **not** that Census rejected, received all bytes, or finished the request. Remote completion remains unknown. The immutable failure records `submissionOrCleanupUnresolved:true`; no retry or lease release occurred.

Offline diagnostic and adoption ran with global fetch forbidden and a 180-second cancellation deadline. Full retained hospital replay authenticated 5,419 source rows, and exact mapping/CSV/multipart reconstruction conserved 5,413 eligible and 6 ineligible rows. All nine source file hashes were checked before and after adoption, including stable source file identities and source-directory identity. No addresses, opaque IDs or source names were logged. This is failure-evidence replay, not the successful-output verifier: no successful output exists.

Source root: `C:\Master Data\datahub\data\worktrees\maine-provider-preflight`.
Destination root: `C:\Master Data\datahub`.
Identical relative job path: `data/business-sources/cms-hospital-census-geocoding/jobs/b2473d79-39d8-4aa9-90ee-251cd2d3a374`.

Before copying, both exact destination job and lease were absent; existing ancestors were canonical non-symlink directories. The main quarantine was created **first**, exclusively and fsynced, at `data/business-sources/census-public-geocoder/.source-lease`. It preserves the original 191 bytes, SHA-256 `00d1c061558b3120dd5cca70f589f6066748b67fd20c6bb2fc32878976038797`. The historical `ownerPid:31516` is not proof of a living process. The marker deliberately keeps both native demo and hospital workflows unavailable through their existing exclusive lease primitive. There is no automatic expiry/takeover, and the adoption has no lease-deletion rollback path.

Exactly nine files were exclusively created and fsynced under the new main job. Source originals and source quarantine remain unchanged. Main modules reloaded the retained source and reconstructed mapping/upload/multipart with networking disabled; final main/source hashes and rosters matched. No success receipt, source refresh, production pointer, main code/config edit or retry was performed. The ignored local adoption script is `data/tmp/adopt-hospital-geocoding-failure-20260912.mjs`; it is fixed to these paths and hashes and is not a general recovery API.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| catalog-before.json | 547 | fc858d2ecef3eab9475b0b6c2a1b2e671f0805e1e62ba7d9d1256e3092114106 |
| failure.json | 3116 | c28858bf76145da02668b19091335b1657414b309f0290758b8d6a3ae2a15ac1 |
| intent.json | 2819 | 96b3e23063432df9c12a16cf4c7e464519be2d80d5cb0f1278bd758223465e7d |
| mapping.json | 1690604 | b2c09a6b037554a9b06c06287db9f51d2aca9dc1fcc013a2f04a94967cc80f8a |
| multipart.bin | 471098 | f326cc463968c80886612572124cfe90a527935192770476a030237681cf4697 |
| policy.json | 1803 | ce5e1cecaa395ca2efc8bef3cb2305b8dba78d8920fb5cd20740519363449e39 |
| request-1.json | 279 | c8894cdbf7d987c68b8196d2a10ddf9ca54074fde3185dfbf7abe420cdbeafce |
| request-2.json | 438 | 32a9b40869b8f4869bc17faa70091164197af5d17c8ffd4ace0f366b25a0d552 |
| upload.csv | 470776 | 79b3380aedc013a199e0c42badd9c6a99e286065c01a1b556cbd49ceb2fba7e5 |

Remaining boundary: there is no verified match/nonmatch result and no known remote-completion evidence. Do not clear either quarantine, resubmit the cohort, or split it into retries based solely on this local timeout. Any future disposition requires a separately reviewed provider-completion/duplicate-submission decision; this document does not authorize one.
