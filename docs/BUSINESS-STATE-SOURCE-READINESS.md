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

The closest broad-state activation target is the existing Illinois offline connector. It still requires five same-run official files, successful verification, and a national-registry adapter. Unattended source retrieval and broader redistribution remain gated on written Illinois authorization. Oklahoma and California remain rights/schema-preflight candidates, not approved acquisitions.

This readiness assessment changes no source release, registry release, coverage release, or production pointer.
