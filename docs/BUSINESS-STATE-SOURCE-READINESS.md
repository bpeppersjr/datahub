# State business-source readiness

The state coverage view now distinguishes broad jurisdiction organization coverage from statewide license/permit coverage, local sources, and national sector sources. A state having NPPES, FMCSA, EPA, SNAP, FDIC, NCUA, or FSIS records does not mean Datahub has a broad state organization register or every active business in that state.

`runner/business-state-source-readiness.mjs` pins policy version `1.0.0` for the 50 states and District of Columbia. It classifies each current state row as one of:

- `broad-jurisdiction-organization-layer`;
- `statewide-scoped-layer-only`;
- `local-and-national-sector-layers-only`;
- `national-sector-layers-only`; or
- `outside-50-states-and-dc-peer-scope`.

The current broad production organization layers are Colorado, Connecticut, Delaware, Florida, Iowa, New York, Oregon, and Pennsylvania. Alaska, California, District of Columbia, Texas, and Washington have statewide but license/permit-scoped layers without a broad layer. Illinois has Chicago evidence but no published statewide release. The remaining 37 jurisdictions have only national sector layers in the current production registry.

Against coverage release `national-business-coverage-views-20260902-115337634Z-ba689784`:

- all 51 jurisdictions have some national-sector location evidence;
- 8 have a broad production organization layer and 43 do not;
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

[Queue 5](STATE-BUSINESS-SOURCE-DISCOVERY-QUEUE-5.md) assessed Ohio, North Carolina, New Jersey, and Virginia in four concurrent, non-overlapping official-source workstreams. All four remain `HOLD`. Ohio documents a paid FTP file but no current schema or recurring contract; North Carolina documents a paid weekly FTP snapshot but only an old public layout and no current rights/change contract; New Jersey supports paid per-record bulk delivery and periodic additions/modifications but publishes no machine layout or deletion semantics; Virginia permits discretionary structured-data requests but documents no recurring business-entity product. The management assessment catalog now merges these four first-pass decisions with the five-state revalidation, so nine current state rows expose a source gate without modifying any production data release.

This readiness assessment changes no source release, registry release, coverage release, or production pointer.
