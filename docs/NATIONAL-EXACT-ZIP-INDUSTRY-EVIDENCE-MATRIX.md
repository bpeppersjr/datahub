# National exact-ZIP cross-industry evidence matrix

This immutable, pointer-free, local-review-only release composes nine already retained and governed national ZIP layers over the exact 48,194-member `zip-denominator-gap-cohort`. It performs no acquisition or network access and is not enrolled in production.

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

Cell status is `positive` when the pinned source layer reports a positive count, `measured-zero` when it explicitly included the ZIP and reported zero, and `outside-source-denominator` when the exact cohort key is absent from that layer's complete positive-plus-geography-denominator union. Industries not listed in the release are unavailable and are not materialized as implied zeros.

Counts are source-specific memberships. They are not additive across industries, unique businesses, verified physical sites, current-operation facts, all-business completeness, or an authoritative USPS denominator. No cross-industry total is emitted. Temporal references describe the retained source snapshot only; they do not turn `positive`, `measured-zero`, or `outside-source-denominator` into a current-operation classification.

The release contains 100 two-digit-prefix buckets. The registration pins its content-addressed manifest; every manifest pins the cohort and all nine source registrations, resolved pointer bytes where applicable, releases, manifests, and ZIP artifacts. Verification reconstructs all 48,194 rows from those exact inputs. Bounded lookup reads one prefix bucket without replaying the full matrix.

Build with `npm run exact-zip-industry-matrix:build` and verify the registered release with `npm run exact-zip-industry-matrix:verify`.
