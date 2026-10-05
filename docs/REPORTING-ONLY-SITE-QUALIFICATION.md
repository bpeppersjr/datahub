# Reporting-only site qualification

`reporting-only-site-qualification@1.0.0` is a pointer-free, local-review-only derived release for the already-retained MA, NJ, TN, and OH childcare reporting-location cohort. It is a separate denominator, never an extension of matching-profile or entity-resolution inputs. The selected release is `reporting-only-site-qualification-b9a3ce44ffa33ec048794d7db22e3147ebb1626a2f6e990d4a203072cb381e0c`; its manifest SHA-256 is `e66fd91f1c77c49a788aab02261d1d6eea4259c0dda3b362277b6d4807bf993b` and its 13,182-row gzip artifact SHA-256 is `bc6a9216936389cdb0736af7b6d7d6bf7ed68ed1b77caac2e32a25685cc2abbb`.

The source split is MA 3,007, NJ 4,075, TN 1,863, and OH 4,237. ZIP5 is present on 13,010 records and absent on 172 Tennessee records: 27 missing-source-ZIP and 145 invalid-source-ZIP-placeholder. ZIP4 remains a separate value. The retained point-evidence summary has 8,942 county assignments, 3 Tennessee missing-geocode rows, and 4,237 Ohio rows excluded by the source policy. A same-code ZCTA is only code correspondence; it is not polygon membership. USPS ZIP validity and deliverability are unverified, and no entity polygon is present.

All four state sources remain source-preserving: MA labels (including 13 `Expired` rows and 2 `Regional Enrollment Freeze` rows) are not proof of operation; NJ null status is layer membership, not active status; TN `Active` and OH `Open` are publisher terms, not independent current-operation verification. Every site has `current_operation_verified=false`, `active_business_verified=false`, `active_business_eligible=false`, and `identity_matching_eligible=false`. Repeated addresses are allowed; site, establishment, and source-record identifiers are conserved and unique. No source rows were fetched or changed.

The selected release binds the national registry manifest and all 10 reporting/location-evidence ZIP2/unassigned artifacts, the four exact source manifests/policies/transformation versions, temporal and exact-ZIP temporal qualification evidence, Census geography, and the retained point-assignment summary. Its physical-site evidence arithmetic is `8,011,835 matching profiles + 13,182 separate reporting-only sites = 8,025,017 retained site-evidence rows`; this is not an all-business denominator or verified operation count.

The names API and local-review flat export attach this qualification to reporting-only records without matching them. National objective readiness exposes a separate partial requirement and lineage binding; it remains not accepted, with zero eligible/verified reporting-only sites and 13,182 USPS-unverified ZIP claims.

Rebuild and verify offline from retained inputs:

```powershell
npm run reporting-only-site:build
npm run reporting-only-site:verify
```

Generated release payloads stay in ignored local `data/reporting-only-site-qualification/releases/`. Git tracks the registration and executable verifier contract, not generated retained evidence. Missing or changed pinned artifacts fail closed.
