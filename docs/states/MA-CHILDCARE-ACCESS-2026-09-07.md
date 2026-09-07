# Massachusetts: center-based childcare source handoff

## Observed access, not completed acquisition

On 2026-09-07 a Massachusetts peer validated a new public MassGIS/EEC childcare source. The integrator independently repeated metadata, count-only and one-row queries at 17:26 UTC: 3,016 source rows, Query/Extract capabilities, 2,000-record response limit, and successful WGS84 point output. No bulk download, connector enrollment, schedule or production pointer change occurred. The separate paid CIMS registry assessment remains unchanged.

Primary endpoints:

- [Layer metadata](https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Licensed_Child_Care_Programs/FeatureServer/0?f=pjson)
- [Publisher dataset description](https://www.mass.gov/info-details/massgis-data-licensed-child-care-programs)
- [Publisher general usage policy](https://www.mass.gov/info-details/about-massgis)
- [ArcGIS item metadata](https://www.arcgis.com/sharing/rest/content/items/c8c5aacce28e48339f17894447c73038?f=pjson)

The peer's publisher-page inspection identified center-based licensed care, excluding family/home-based care and funded public-school programs, with a February 17, 2026 documented update. The integrator's web reader could not reopen the two mass.gov pages; live API inspection succeeded. Preserve that evidence distinction and recheck the publisher scope and policy before enrollment. Blank item license metadata is not a separately named open license.

## Field and temporal contract to implement

Use explicit fields: PROV_NUM as a source identifier assertion; PROG_NAME; ADDRESS; CITY; ZIPCODE; LICENSED_STATUS; PROG_TYPE; CAPACITY; and relevant source metadata. PROG_UM is an umbrella label, not proof of corporate parent ownership. Exclude PHONE and personal contact fields. Do not expand acquisition to home-based care through the broader upstream dataset.

The independently sampled provider P-169327 had ZIPCODE `02536-5023` and valid WGS84 coordinates. Normalize ZIP5 to `02536` and ZIP4 to `5023`, retaining leading zeroes and never joining these normalized fields. Business records retain longitude/latitude only, not feature geometries. Keep source responses in the restricted raw provenance layer; do not add business polygons to governed geography.

The peer observed Current, Expired, Regional Enrollment Freeze and Renewal in progress statuses. Preserve native status and dated observation. Dataset membership does not prove operation today; even Current is a licensing assertion, not independently verified operating status. No country or state completeness percentage follows from the 3,016-row count. Provider identifier lifecycle, definitive status codebook and refresh cadence remain unverified.

## Bounded connector acceptance and application handoff

1. Declare source hosts, policy/attribution (MassGIS and EEC), explicit fields, resource ceilings and internal raw retention. Revalidate source-specific reuse restrictions before approving normalized exports.
2. Acquire a stable ID inventory, retrieve bounded batches, and check duplicate/missing IDs plus counts and publisher edit metadata before and after acquisition. Reject an inconsistent snapshot rather than claiming snapshot isolation from pagination alone.
3. Implement conservative pacing, bounded response sizes and deadlines, publisher Retry-After, cooperative cancellation and run-scoped staging cleanup. Preserve prior published releases on every failure.
4. Test ZIP separation, coordinate handling, status preservation, excluded fields, schema drift, missing/duplicate IDs, changed snapshots, cancellation and atomic publication with offline fixtures.
5. After contract and tests pass, enroll in an explicit childcare industry bucket. Co*Tive workers own acquisition and later scheduled refreshes; state agents move to other validation work. Do not submit downloads merely because this research note exists.

This handoff is source-readiness evidence, not a built connector or a completed state/industry dataset. No runtime migration is needed. Verification for this documentation-only change is live bounded API inspection and Git whitespace validation; no new full-suite test claim is made.
