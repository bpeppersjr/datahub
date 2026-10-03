# ZCTA GDP model specification

This pointer-free immutable release records a proposed county-to-ZCTA GDP model. Its decision status is **HOLD**: it does not approve a model, authorize output, emit numeric GDP, create a runtime pointer, or enroll production.

The proposed primary method normalizes observed 2023 ZIP Business Patterns payroll multiplied by the governed 2020 ZCTA/county polygon share within each directly matched 2024 BEA county. Polygon-area and establishment-weighted results are sensitivity comparisons, not automatic substitutes. The proposed uncertainty range is method spread, not a statistical confidence interval.

Any material relationship missing direct county GDP, null or flagged GDP, absent primary weight, or failed county conservation causes the ZCTA estimate to be withheld. Suppressed, unpublished, and not-applicable observations remain null and are never converted to zero. Vintages, county components, weights, relationship identities, release hashes, unrounded values, and withholding reasons must remain traceable.

The artifact prohibits claims of official USPS ZIP GDP, BEA-published ZIP/ZCTA GDP, demographic GDP, business value, active-business coverage, statistical confidence, or production readiness. The existing BEA source policy is unchanged and remains binding. Numeric publication requires explicit approval of a separate derived-model policy and this specification.

Selected release: `zcta-gdp-model-specification-9d24fc138d755c02351fc32e82f2f068e483cfbdfa13a68952fff1454c7577d6`; manifest SHA-256: `4589ab319abc68b9f01792195c0bfa3330393dab37e3e7658180d94d63ac28de`.

```powershell
npm run zcta-gdp-model-specification:build
npm run zcta-gdp-model-specification:verify -- --manifest <immutable-manifest>
```
