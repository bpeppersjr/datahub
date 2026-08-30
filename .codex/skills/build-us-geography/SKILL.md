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
7. Run the relevant tests and `npm run check`. Do not commit files under `data/`; commit the builder, contract, policy, documentation, and skill.

## Invariants

- Preserve the source-native Census properties in source GeoJSON and provenance in the release manifest.
- Treat `state`, `county`, and `zcta` as separate geography types with typed IDs.
- Call ZIP-shaped geography a ZCTA. State clearly that not every USPS ZIP has a polygon.
- Do not force a ZCTA into one state or county. Overlay it when a downstream workflow needs jurisdiction membership.
- Keep all staging, releases, caches, and generated files inside the repository's `datahub` directory.
- Publish immutable releases and write the manifest last; never overwrite an earlier release in place.
