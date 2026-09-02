---
name: build-us-geography
description: Build, refresh, validate, or use Co*Tive Collector's nationwide Census polygon foundation for states, counties, ZCTAs, centroids, and spatial indexes. Use for U.S. geographic coverage and point-to-area assignment; do not use it to claim exact USPS delivery-route boundaries.
---

# Build U.S. Geography

Use the repository's versioned Census geography builder instead of inventing ZIP ranges, scraping map sites, or treating ZIP Codes as guaranteed polygons.

## Workflow

1. Read `docs/US-GEOGRAPHY-DATASET.md` and inspect `data/geography/current.json` plus the referenced manifest when a release exists.
2. For a schema-sensitive consumer, read [references/schema.md](references/schema.md).
3. Before a complete national rebuild, confirm the request authorizes a download that can transfer and store hundreds of megabytes. A request to build or refresh the nationwide dataset is sufficient authorization.
4. Run `npm run geography:build -- --sample` after modifying acquisition or normalization logic. Run `npm run geography:build` only for the authorized complete release.
5. Run `npm run geography:verify`, then verify that the release manifest reports complete coverage, expected source counts, EPSG:4326, and the configured geometry offset. Use `derived/index/*.jsonl` to locate partitioned geometry.
6. When a consumer needs county or state membership for ZCTAs, read `docs/ZCTA-JURISDICTION-CROSSWALK.md`, then run `npm run zcta-crosswalk:build` and `npm run zcta-crosswalk:verify`. Preserve the many-to-many relationships and their `polygon-area-only-not-business-location` semantics.
7. For a spatial ZIP-shaped coverage denominator, require a verified geography manifest with `complete_national_release: true`, complete checksummed ZCTA artifacts, and `coverage.zctas` equal to `coverage.source_available_counts.zctas`. Use that complete selected Census ZCTA5 polygon set directly; USPS operational ZIP evidence is optional supplemental routing evidence.
8. Run the relevant tests and `npm run check`. Do not commit files under `data/`; commit the builder, contract, policy, documentation, and skill.

## Invariants

- Preserve the source-native Census properties in source GeoJSON and provenance in the release manifest.
- Treat `state`, `county`, and `zcta` as separate geography types with typed IDs.
- Call ZIP-shaped geography a ZCTA. State clearly that not every USPS ZIP has a polygon.
- Treat the complete selected Census-published ZCTA5 polygon set as authoritative only for spatial analysis explicitly denominated by that Census layer and vintage.
- Do not require USPS operational ZIP evidence to publish or use the Census ZCTA5 spatial polygon denominator; when available, retain it as separate supplemental routing evidence.
- ZIP+4 has no polygon in this contract. Preserve it as a postal routing/address identifier and never fabricate or inherit geometry for it.
- Direct Census-published geometry is source evidence, not a probabilistic inference; do not attach a confidence percentage.
- Do not force a ZCTA into one state or county. Overlay it when a downstream workflow needs jurisdiction membership.
- Keep all staging, releases, caches, and generated files inside the repository's `datahub` directory.
- Publish immutable releases and write the manifest last; never overwrite an earlier release in place.
