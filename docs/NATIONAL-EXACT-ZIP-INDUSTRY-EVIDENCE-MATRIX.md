# National exact-ZIP cross-industry evidence matrix

This immutable, pointer-free, local-review-only v1.2 release composes eleven already retained and governed national ZIP layers over the exact 48,194-member `zip-denominator-gap-cohort`. It adds separately identified CMS hospital and nursing-home directory-row evidence from the registered `cms-retained-directory-zip-evidence` release. It performs no acquisition or network access and is not enrolled in production.

Each row preserves `zip5`, keeps `zip4` separately as `null`, retains the cohort classification and ZCTA identifier where present, and leaves USPS validity `null`. Version 1.1 carries a fail-closed `temporal_status` and source reference date in every cell. Invariant source-reference-field, semantics, and exact pinned source-manifest provenance are stored once per source in the manifest bindings and returned by bounded lookup as `source_metadata`. A valid governed source reference date produces `source-referenced-current-operation-unverified`; a missing or malformed reference produces `source-reference-unresolved` with a null date. Neither state asserts present-day operation.

- `healthcare_organizations`: CMS NPPES organization practice-location count;
- `regulated_facilities`: EPA ECHO source-defined active facility count;
- `fdic_offices`: FDIC current indexed office count;
- `food_safety_establishments`: FSIS source-defined active establishment count;
- `credit_union_locations`: NCUA scoped location count;
- `snap_retailers`: USDA SNAP-authorized retailer location count;
- `pharmacy`: NPPES pharmacy organization count;
- `transportation`: FMCSA source-defined active registration principal-office count;
- `tax_exempt_organizations`: IRS EO filing-address organization count.
- `cms_hospital_directory`: retained CMS hospital directory rows by reported ZIP5;
- `cms_nursing_home_directory`: retained CMS nursing-home directory rows by reported ZIP5.

CMS cells are source-specific directory-row counts, not active-business or site counts. Because each pinned CMS directory is fully retained and indexed, a zero means no records in that category of that retained source release reported the ZIP; it does not mean no facility operates there. The two CMS dimensions preserve their release reference dates and carry `source-referenced-current-operation-unverified` temporal status.

Cell status is `positive` when the pinned source layer reports a positive count, `measured-zero` when it explicitly included the ZIP and reported zero, and `outside-source-denominator` when the exact cohort key is absent from that layer's complete positive-plus-geography-denominator union. Industries not listed in the release are unavailable and are not materialized as implied zeros.

Counts are source-specific memberships. They are not additive across industries, unique businesses, verified physical sites, current-operation facts, all-business completeness, or an authoritative USPS denominator. No cross-industry total is emitted. Temporal references describe the retained source snapshot only; they do not turn `positive`, `measured-zero`, or `outside-source-denominator` into a current-operation classification.

The release contains 100 two-digit-prefix buckets plus a separately hashed `out-of-cohort-source-zip-gaps.json` artifact. This sidecar preserves CMS source/category ZIPs outside the exact cohort rather than dropping them or folding them into the cohort. The current two gaps are nursing-home directory rows for 35999 and 73706 (one each). They remain out-of-cohort evidence; this is not an invalid-USPS finding, a zero-activity result, or a current-operation claim. The sidecar is designed to accept additional governed category gaps (including a future childcare source such as 21708) without changing cohort membership.

The registration pins the content-addressed manifest; every manifest pins the cohort, all eleven source bindings, the CMS registration/manifest and each of its 99 prefix-bucket artifacts, in addition to the other source releases, manifests and ZIP artifacts. CMS hospital and nursing-home row totals conserve to 5,419 and 14,690, respectively. Verification reconstructs all 48,194 rows and the out-of-cohort sidecar from those exact pinned inputs. Bounded lookup reads one matrix prefix bucket and the small gap sidecar without replaying the full matrix.

Current registered release `national-exact-zip-industry-evidence-matrix-fee8ddd93478a7038586b3b44a2c319162518187ecd0a373e5a2445e7535f3a8` contains 530,134 cells, 101 artifacts, and 177,710,418 artifact bytes. Its status totals are 223,813 positive, 248,869 measured-zero, and 57,452 outside-source-denominator cells. Historical releases are immutable and remain available.

Build with `npm run exact-zip-industry-matrix:build` and verify the registered release with `npm run exact-zip-industry-matrix:verify`.
