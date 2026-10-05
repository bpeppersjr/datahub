# Business entity geography relationship

`business-entity-geography-relationship@1.0.0` is a pointer-free, local-review-only row-level join from the selected national registry matching-profile cohort to independently governed postal-key, Census-code, and point-in-county evidence. It preserves the registry release unchanged and does not assert USPS deliverability, ZIP/ZCTA polygon membership, current operation, or unique businesses.

Build and replay the exact selected release offline:

```powershell
npm run business-entity-geography:build
npm run business-entity-geography:verify
```

Generated 100 ZIP2 shards remain in ignored `data/business-entity-geography-relationship/releases/`; do not commit generated payloads. The tracked registration pins release `business-entity-geography-relationship-99d70051979cb4d4e116b832994daef87f84ab919d6392f4fa9e98ea3798f8d7` and manifest SHA-256 `07e561938b2d027f0c1586e5db1a2b775f7680d486e75dfb4e99b399cc0bbaa2`. Readers fail closed if the exact registration, manifest, input lineage, or row partition differs.

The release conserves 8,011,835 matching profiles: 7,963,395 same-code Census ZCTA *candidates*, 48,439 source-contributed ZIP5 keys outside the selected ZCTA code set, one explicit `00000` placeholder, and zero missing ZIP5 values. Same-code is only a code correspondence, never polygon membership. ZIP4 remains separate; USPS assignment and deliverability are null/unknown. Source-reported state is retained separately and never inferred from ZIP5.

Strict retained point-in-county replay assigns 372,079 profiles: 252,064 USDA SNAP profiles, 77,272 FDIC profiles, and 42,743 DC basic-license profiles. The DC subset is assigned only through its exact retained EPSG:26985→EPSG:4326 transformation declaration. There are 21 unmatched and 7 ambiguous point assignments; 6,976,397 profiles have no retained geocode; 640,383 legacy points lack governed CRS/axis semantics; 22,948 coordinates are address-component centroids, not premise points. The latter two classes remain unassigned. No coordinate ranges or presumed axis order are used to repair legacy coordinates. ZCTA point assignment is never performed, and no entity polygon is created.

The prior coverage summary's 995,293 matching-profile assignment is retained only as historical aggregate evidence; it exceeds the new strict row-level result by 623,214. The discrepancy is not normalized or treated as a target because that aggregate cannot prove the CRS/axis semantics needed for per-profile joins. State/county map properties now expose a separate point-assigned matching-profile evidence measure from this release; ZIP/ZCTA statistical views remain separate and do not contribute to it. Name drill-down and flat JSON/CSV rows carry the row-level relationship and selected release lineage when the exact pinned registry release is used. Other historical/external registry releases and reporting-only rows do not receive a fabricated join.

Reporting-only childcare rows are outside this 8,011,835 matching-profile denominator and therefore receive no matching-profile relationship row; the separate 13,182 MA/NJ/TN/OH center rows and 172 TN ZIP-quality gaps remain source-reporting evidence, never silently mixed into the entity-profile count.

This derived release performs no network requests or source acquisition and changes no registry bytes, source decisions, production plans, pointers, approvals, or enrollment.
