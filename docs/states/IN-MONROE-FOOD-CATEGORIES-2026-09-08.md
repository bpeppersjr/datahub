# Monroe County food category context — September 8, 2026

## Finding

**Multi-Market is not a verified grocery-store category.** The county's public licensing descriptions associate it with farmers-market vendors. No inspected page establishes an exact mapping from these human descriptions to ArcGIS `TYPE`, `LicensedCheck`, or `IsArchived` values.

## Human licensing descriptions

The official [Applications page](https://secure.in.gov/counties/monroe/Departments/health-department/food-safety/applications/) distinguishes:

- Multi-market operations: food provision at farmers markets.
- Mobile operations: movable units, including vehicles, vessels, trailers and pushcarts.
- Prepackaged-only operations: no on-site preparation; the page exempts operations offering only non-potentially-hazardous prepackaged foods from county health licensing.
- Remote/catering kitchens: food preparation or storage, catering, shared kitchen space and servicing mobile vendors; not necessarily customer-facing stores.
- Seasonal permanent structures: a limited licensing-year operating period.
- Temporary operations: at most fourteen consecutive days connected with an event.
- General retail: a broad food-handling/provision definition, not grocery-specific.

These descriptions identify material fixed-site exclusions and licensing exemptions, but do not decode database abbreviations or establish live license status.

The separate [farmers-market guidance landing page](https://secure.in.gov/counties/monroe/Departments/health-department/food-safety/information-for-food-establishments/) directs vendors to multi-market applications and distinguishes market-manager registration from vendor licensing. A market, its manager and its vendors must not be collapsed into one business entity.

The [retail establishment page](https://secure.in.gov/counties/monroe/Departments/health-department/food-safety/retail-food-establishment/) describes plan approval before operation. An application, plan approval or database checkbox is not independently verified present operation. The [temporary/seasonal page](https://secure.in.gov/counties/monroe/Departments/health-department/food-safety/temporary-and-seasonal-food/) separately describes those approval processes.

## Remaining connector prerequisites

`REST` remains an undocumented source literal: do not expand it to restaurants, all permanent retail, or groceries without source-specific evidence. Likewise, retain `LicensedCheck` and `IsArchived` as literal source flags rather than asserting current valid licenses or operating businesses. Existing aggregate counts in the Indiana triage remain source-row counts.

A grocery-specific connector needs a verified codebook/filter, license validity and expiration semantics, plus the separate source-use assessment. Even a complete county license roster may omit exempt retailers. Preserve county-only scope, missing address/state/ZIP gaps, and mobile/seasonal/temporary/commissary distinctions. Do not manufacture physical-site eligibility from a geocoded point or substitute mailing addresses.

Only official public descriptive pages were read. No application links were submitted, accounts created, contacts made, business records or IDs queried, or source files downloaded. No acquisition or legal approval is asserted.
