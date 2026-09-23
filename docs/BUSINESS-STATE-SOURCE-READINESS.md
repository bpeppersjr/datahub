# State business-source readiness

The state coverage view now distinguishes broad jurisdiction organization coverage from statewide license/permit coverage, local sources, and national sector sources. A state having NPPES, FMCSA, EPA, SNAP, FDIC, NCUA, or FSIS records does not mean Datahub has a broad state organization register or every active business in that state.

`runner/business-state-source-readiness.mjs` pins policy version `1.3.0` for the 50 states and District of Columbia. It classifies each current state row as one of:

- `broad-jurisdiction-organization-layer`;
- `statewide-scoped-layer-only`;
- `local-and-national-sector-layers-only`;
- `national-sector-layers-only`; or
- `outside-50-states-and-dc-peer-scope`.

For the national goal matrix's broad-evidence threshold, retained layers are Alaska, Colorado, Connecticut, Delaware, District of Columbia, Florida, Iowa, New York, Oregon, and Pennsylvania. The separate state-source-readiness classifier treats Alaska as statewide license-scoped; it now classifies D.C. as broad-jurisdiction organization evidence. California, Texas, and Washington remain statewide but license/permit-scoped in that classifier. Illinois has Chicago evidence but no published statewide release. The remaining 37 jurisdictions have only national sector layers in the current production registry. These are evidence-presence classifications, not production enrollment or complete business coverage.

D.C. admission uses `dc-basic-business-license-organization-evidence@1.0.0` over the exact retained `dc-basic-business-licenses-2026-09-07-70f09a6a032c9408` release. It represents source-defined Active Basic Business License Customer Number groups only: exempt businesses and other licensing regimes are outside scope, and a source `Active` status does not prove continuous operation. A Customer Number is a provisional organization/premise grouping; multiple activity rows remain assertions. Record-level outputs are local-review-only. Geocoding is reported only at source-profile level, not as a D.C.-premise or address-state rate, and quarantined counts are disclosed. D.C. all-business and active-business completeness remain null.

Against coverage release `national-business-coverage-views-20260902-115337634Z-ba689784` (the retained production coverage view remains unchanged):

- all 51 jurisdictions have some national-sector location evidence;
- 8 have a broad production organization layer and 43 do not (this cited release predates the D.C. evidence admission below);
- 7,981,531 source-preserving location profiles are reported in the 51-jurisdiction scope;
- 994,523 have a source coordinate assigned to one governed county; and
- the resulting coordinate-assignment ratio is 12.46%.

These are source-preserving profiles, not deduplicated businesses or a completeness percentage. Organization-only records are not allocated into the current state artifact, so state organization totals cannot be inferred from these rows. `complete_all_active_businesses` remains false.

The management API includes `state_source_readiness_summary` in `GET /api/business-coverage` and `state_source_readiness` on each `GET /api/business-coverage/states` row. The States view displays the scope classification.

## Geometry boundary

Business records may use address-level `latitude` and `longitude` when genuinely supplied or governed-geocoded. They do not receive polygons or other business geometry. Governed polygons remain confined to the United States, state, county, and Census ZIP/ZCTA geography layers; ZIP+4 remains non-geometric.

## Next acquisition gate

The closest broad-state activation target is the existing Illinois offline connector. Its optional national-registry adapter is implemented and tested, but production activation still requires five same-run official files, a verified immutable Illinois release, an explicitly authorized registry rebuild, and later coverage-view publication. No Illinois source release or production pointer is present. Unattended source retrieval and broader redistribution remain gated on written Illinois authorization. Oklahoma and California remain rights/schema-preflight candidates, not approved acquisitions.

[Queue 4 wave 1](STATE-BUSINESS-SOURCE-DISCOVERY-QUEUE-4-2026-09-03.md) records Idaho, New Mexico, Maine, and Wyoming; [wave 2](STATE-BUSINESS-SOURCE-DISCOVERY-QUEUE-4-WAVE-2-2026-09-03.md) records New Hampshire, Montana, Rhode Island, and South Dakota; and [wave 3](STATE-BUSINESS-SOURCE-DISCOVERY-QUEUE-4-WAVE-3-2026-09-03.md) completes Vermont, West Virginia, North Dakota, Alaska, and the District of Columbia. Eleven candidates remain on contract or procurement hold. Alaska and D.C. have official machine-readable sources approved only for bounded connector/preflight and offline-fixture implementation. No candidate has full-acquisition or production authority, and every current production pointer remains unchanged.

The bounded [Alaska Corporations](AK-CORPORATIONS.md) and [D.C. Corporate Registration](DC-CORPORATE-REGISTRATION.md) connectors are now implemented and fixture-tested. Alaska performs one HEAD plus a capped prefix read, parses and persists no live rows, and labels possible unparsed row bytes truthfully. D.C. performs one metadata request plus six aggregate/count-only requests and rejects row-bearing metadata. Both pin exact schemas, confine fixture and output paths to Datahub, reject link escapes and duplicate identities, split ZIP5 from ZIP+4, retain administrative-address semantics, exclude registered-agent/contact fields, remove failed staging, and publish only checksum-verified non-overwriting local-review releases without a current pointer. Full source acquisition, registry/coverage contribution, and Heatmap Builder admission remain disabled.

The [2026-09-03 five-state source revalidation](STATE-BUSINESS-SOURCE-REVALIDATION-2026-09-03.md) rechecked California, Georgia, Oklahoma, Nebraska, and Vermont through non-overlapping parallel workstreams. All five remain `HOLD`: zero accounts, term acceptances, purchases, row requests/enumerations, complete downloads, source publications, and pointer changes occurred. The machine-checkable decision artifact is validated before the management API exposes the latest source gate on matching state rows. A pinned release comparison marks the diagnostic coverage figures stale after a future coverage cutover rather than silently reusing them.

[Queue 5](STATE-BUSINESS-SOURCE-DISCOVERY-QUEUE-5.md) assessed Ohio, North Carolina, New Jersey, and Virginia in four concurrent, non-overlapping official-source workstreams. All four remain `HOLD`. Ohio documents a paid FTP file but no current schema or recurring contract; North Carolina documents a paid weekly FTP snapshot but only an old public layout and no current rights/change contract; New Jersey supports paid per-record bulk delivery and periodic additions/modifications but publishes no machine layout or deletion semantics; Virginia permits discretionary structured-data requests but documents no recurring business-entity product.

[Queue 6](STATE-BUSINESS-SOURCE-DISCOVERY-QUEUE-6.md) assessed Michigan, Tennessee, Massachusetts, and Arizona as the next four unreviewed national-sector-only states by diagnostic gap. All four remain `HOLD`: Michigan has only enabling authority for a quoted customized extract; Tennessee advertises a purchasable database without a current public contract; Massachusetts publishes price and partial cadence language but withholds the schema; Arizona requires a signed purpose statement and paid extraction while leaving the current machine/change contract unpublished.

[Queue 7](STATE-BUSINESS-SOURCE-DISCOVERY-QUEUE-7.md) assessed Maryland, Missouri, Indiana, and South Carolina concurrently as the next ranked official-source gaps. All four remain `HOLD`: Maryland has an old fixed-file layout but no current code/change/rights contract; Missouri's bulk service is reported but absent from the current catalog; Indiana's paid account/USB/update route lacks a public schema and complete differential contract; and South Carolina requires a signed, prepaid subscription while withholding the exact schema and downstream-use rights.

[Queue 8](STATE-BUSINESS-SOURCE-DISCOVERY-QUEUE-8.md) assessed Louisiana, Minnesota, Alabama, and Wisconsin concurrently. All four remain `HOLD` for their reviewed broad-registry products: the published material does not close the required product-scope, schema, identifier-lifecycle, address-role, change, automation, rights, and privacy gates.

The current machine-validated catalog now covers all 50 states plus D.C. with exact per-state provenance. It reports 41 holds, two bounded-connector decisions (Alaska and D.C.), and eight production-ready retained broad layers (Colorado, Connecticut, Delaware, Florida, Iowa, New York, Oregon, and Pennsylvania). This separate catalog's `production_ready` count is not the same measure as the national goal matrix's broader retained-evidence admission: D.C. now qualifies there under the bounded licensing evidence contract, without becoming a production-ready broad registry. Neither status authorizes autonomous acquisition or establishes complete active-business coverage. All 51 catalog rows continue to authorize zero autonomous acquisitions.

This readiness assessment changes no source release, registry release, coverage release, or production pointer.
