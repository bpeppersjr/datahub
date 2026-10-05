# Census ZCTA residual geography

The proposed immutable dataset is `us-census-non-zcta-state-residual@1.0.0`: the geometric difference between each retained Census state-equivalent polygon and selected 2020 Census ZCTA polygons clipped to that state. A future application view would default to the 50 states plus D.C.; the retained source has 56 state equivalents.

The intended partition uses projected, exhaustive N, E, S, W, and C sectors, with at most five features per state. These are orientation aids, not official regions. The residual includes water.

The layer is non-postal Census residual geometry. It never asserts ZIP membership, USPS operation, parks, Native or tribal land, private land, habitation, population, business location, business gaps, or ZIP completion. It contains no business geometry and does not block the existing state or ZCTA map.

No production release or map overlay is published. A retained-data feasibility probe failed closed: D.C. failed in 713 ms and Rhode Island in 1.075 s with polygon-clipping ring-construction errors; California exceeded 90 seconds, while a sector-first California probe exceeded 27 seconds and 2.8 GB for only 256 candidates. Alaska antimeridian and Hawaii multipart extents also require robust handling. Production requires a GEOS-class tiled overlay with geometry validity repair and a precision grid, plus state-partitioned immutable artifacts and replay verification.

`runner/census-zcta-residual-geography.mjs` exposes only a static, governed readiness contract with exact retained-source pins and measured blockers. It contains no build, publish, verify, pointer, or artifact-reading path. The application exposes readiness status—not an overlay toggle—and remains isolated from the existing state/ZCTA map.
