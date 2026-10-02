# Retained childcare county coverage adapter

`runner/retained-childcare-county-coverage-adapter.mjs` implements the separately versioned `retained-childcare-county-coverage@1.0.0` contract. It prepares in-memory national coverage additions from the already retained PA/MD county derivative. It does not change `retained-childcare-coverage-extension.mjs`, publish a coverage successor, enroll one, change any pointer, acquire data, or authorize redistribution.

## Exact retained chain

The adapter accepts only the existing county display enrollment (`cf68097002840033d4f21a61659ad09d88d3023ce92906ad7efa1792b77362f7`) and derivative run `b660d059-25c4-44fc-8c4a-b94bc87d855e`, manifest SHA-256 `be0798c546d0016d7633c563f73e62734358cd0a8dd0025c28e35a0cdc3298ee`. It pins the original derivative registry, the September 11 registry and coverage releases, the Census geography release, PA and MD policy bytes, all seven source enrollment/configuration bindings, and the selected candidate artifact.

The derivative intentionally retains its September 10 registry dependency (`4e770785282968b8a217f4a8906fa82901eb1fcd462310b3fa57de1763456de9`). The current September 11 registry has hash `d8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76`. Compatibility is established only because their full retained-childcare declarations and candidate artifact descriptors are identical: 12,206 rows, 89,631,634 bytes, SHA-256 `9056279e54106e06d1f4c38236ff236b858927efe87fd8fd421238b960c264df`. The adapter does not relabel the derivative's original dependency or accept a different candidate cohort merely because counts match. Moved current pointers or incompatible pins require explicit future reconciliation.

## Verification boundary

`inspectRetainedChildcareCountyCoverageCompatibility()` reads bounded retained metadata and reports `source_replay_verified: false`. It is not an independent row or polygon replay.

`loadRetainedChildcareCountyCoverage()` additionally calls the existing v2 county source/polygon replay and requires whole-report equality with the pinned derivative. It consumes the current registry's checksum-bound candidate artifact, verifies candidate membership and source/ZIP correspondence, retains each original source binding, record hash, provenance, status, license dates, reported address and geocode, and separately attaches the derived relationship. It checks the Census county-index bytes, disposition and county conservation, and all fixed metadata again before returning a verified process-local context. Reads use existing app-contained, single-link, byte-bounded readers and accept an AbortSignal; the existing replay retains its cooperative cancellation behavior. No network or writer is called.

`verifyRetainedChildcareCountyCoverage(report)` independently repeats that read-only derivation and requires exact whole-report equality. Duplicate candidates/counties, changed membership or provenance, unsupported sources, incompatible pins, and cancellation fail without a success report. Synthetic calculation and replay helpers cannot issue a production context.

## Counts and semantics

- 6,702 assigned candidate points: PA source 4,930 and MD source 1,772.
- 4,028 missing source points remain unassigned.
- 1,476 unknown-coordinate-system rows remain unassigned, including retained Iowa evidence; no CRS is guessed.
- The three dispositions conserve all 12,206 selected candidates.

The county roster includes 67 PA counties and 24 MD county equivalents. A supported empty county can report a measured zero for this selected cohort. Other states/counties and ZIP geography are unsupported/null, never inferred zeros. Counts are retained source-candidate relationships, not unique businesses, verified physical sites, active operation, identity resolution, or nationwide completeness. The 13,182 separately published reporting locations and 11,456 Minnesota credentials are not added to this cohort. Public export and national integration remain false; national completeness remains null and use remains internal.

`prepareRetainedChildcareCountyCoverageViews(context, views)` accepts only an unchanged process-local verified context, returns a copy, and adds `retained_childcare_derived_county_reporting` to national/state/county rows. It leaves the existing `retained_childcare_reporting`, reported-state totals, ZIP views, and ZIP5/ZIP4 fields untouched. Derived state FIPS and county GEOID remain distinct from source-reported state and postal evidence. It is preparation only: no existing production caller consumes or publishes this new contract.

Before copying any rows, preparation requires a view-set `lineage` envelope with exact `coverage_manifest`, `registry_manifest`, and `geography_manifest` bindings (`path`, `release_id`, `sha256`) matching the verified adapter. Every national/state/county/ZIP row must declare the matching registry and geography release IDs and coverage transformation version, the correct row type/identity, and partial semantics. Missing/mismatched vintage or lineage is rejected, as are duplicate scopes and county/state identity conflicts. Only `registry-union`, `all-census-us-areas`, and `50-states-and-dc` national scopes are allowed. Unsupported state/county geography retains null metrics; it does not inherit a national total. These are target compatibility checks, not independent rehashing of arbitrary caller-supplied view-row content; source artifact verification remains a separate publication prerequisite.

Derivative creation is not source observation or freshness. Source provenance and unparsed source license dates remain separate from the county derivative timestamp. Existing immutable coverage artifacts correctly retain their historical county-unavailable fields until a separately reviewed successor is published.

## Focused tests

`node --test runner/retained-childcare-county-coverage-adapter.test.mjs` runs synthetic negative/semantic tests and exact retained metadata compatibility without publication. Setting `DATAHUB_TEST_RETAINED_COUNTY_COVERAGE=1` also enables the slower full retained read-only source replay and adapter verification. The latter is not a production build and creates no outputs. Tests distinguish metadata integrity from independently replayed source membership.
