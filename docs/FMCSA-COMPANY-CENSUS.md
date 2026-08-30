# FMCSA Company Census source layer

This source layer adds the official daily Federal Motor Carrier Safety Administration Company Census to the governed business-data program. It is a regulated-entity source, not a general business census.

## What is acquired

The connector pins the DOT Socrata dataset metadata and aggregate counts, then asks the server for one deterministic CSV containing only `STATUS_CODE=A`, `PHY_COUNTRY=US`, and 29 approved fields ordered by `DOT_NUMBER`. It acquires the official attached data dictionary as semantic evidence. Metadata timestamp and counts are checked again after both files arrive; a changing source is rejected rather than published as a mixed snapshot.

The selected fields cover:

- USDOT and up to three FMCSA docket identifiers;
- legal and DBA names;
- the reported physical location of the principal office;
- source-specific carrier operation, carrier/shipper role, class, hazardous-materials indicator, optional review-only organization type, FMCSA region, source dates, and docket status codes.

Phone, fax, cell, email, officer, D&B, mailing-address, crash, review, inspection, safety-rating, and unrelated operational fields are excluded before acquisition. The retained selected CSV and dictionary are internal artifacts; normalized records contain only the approved public regulatory fields.

## Meaning of a record

FMCSA documents `DOT_NUMBER` as the unique sequential census/registration number and says an entity should have only one active census number. The source file defines `STATUS_CODE=A` for an entity currently in business and subject to the Federal Motor Carrier Safety Regulations or Hazardous Materials Regulations, or for a qualifying intrastate non-hazardous-materials carrier with a USDOT number. That definition is retained verbatim in scope, not generalized into a universal business-operating claim.

The address is the source-reported physical location of the entity's principal office. A record is quarantined when FMCSA marks the physical address undeliverable or when required identity/address values are invalid. Even accepted addresses are not independently proven storefronts, customer-accessible locations, vehicle bases, or current USPS-valid delivery points.

No canonical organization is created. The dictionary says `BUSINESS_ORG_ID` is populated from review only, and the live file leaves it blank for most active U.S. rows. A registered entity may also be an individual proprietor. The connector therefore creates only one provisional physical site and establishment per accepted USDOT record and defers organization and parent resolution until independent evidence exists.

## Privacy boundary

This public regulatory dataset can still contain personal data: a legal name can identify an individual proprietor and the principal office can be a home. Every normalized record carries those warnings. The layer is for source-bounded business-registry and coverage analysis, not personal profiling or exposure of proprietors.

## Run and verify

The build requires the published Census ZBP baseline and geography dependency:

```powershell
npm run fmcsa:build
npm run fmcsa:verify
```

The build publishes immutable run-scoped artifacts first and atomically replaces `data/business-sources/fmcsa-active-us-company-census/current.json` only after schema, filter, count, unique-ordering, quarantine-rate, checksum, and dependency gates pass.

## Validated live release

The independently verified release `fmcsa-company-census-20260830-182538838Z-1bdf3bbe` is bound to source release `fmcsa-company-census-2026-08-30-55fd24985d97e66e` and Socrata `rowsUpdatedAt` `2026-08-30T11:55:17.000Z`. Its selected source contains 2,211,982 `STATUS_CODE=A`, `PHY_COUNTRY=US` rows from a 4,494,460-row Company Census snapshot.

The release publishes 2,195,563 accepted principal-office records across 35,648 source ZIPs and all 56 supported states/territories. It quarantines 16,419 rows: 16,317 source-marked undeliverable addresses, 85 missing/invalid addresses, 16 unsupported state codes, and one missing legal name. The 0.7423% quarantine rate is below the 2% quality gate. Its ZIP/ZBP/ZCTA union contains 39,151 rows.

Only 29 of 147 available source columns were acquired. The retained selected CSV is 402,434,471 decoded bytes with SHA-256 `3471811d938db82f6a49a347ba66cc40cc634b3cd33a103402020fd5de949267`; the 872,158-byte official dictionary has SHA-256 `8d161e59becb19bc1c3efb3369614f23eecd49f5d117d7c41ad44bc9c60c75e8`.

FMCSA can repeat one authority docket in multiple docket slots. Transformation `fmcsa-company-census@1.0.1` preserves the slot observations in the registration profile but emits each typed docket identifier once. The independent verifier requires `(identifier type, value)` uniqueness for every normalized record.

## Coverage and exclusions

FMCSA says the daily file is generated from a database roughly 24 hours old and is not real-time. It includes active, pending, and inactive registrants, but this layer deliberately acquires only the active U.S./territory slice. FMCSA also states that shipper-only business types and entities with an active Hazardous Materials Safety Permit are excluded from the public Company Census file.

ZIP coverage is the union of accepted principal-office ZIPs and the current Census ZBP/ZCTA baseline. ZIPs absent from the current baseline remain visible with an explicit gap. Current USPS ZIP validity remains `unverified` until an authoritative current denominator is integrated.

Official references:

- [FMCSA Open Data Program](https://www.fmcsa.dot.gov/registration/fmcsa-data-dissemination-program)
- [DOT Company Census dataset](https://data.transportation.gov/w/az4n-8mr2/m7rw-edbr)
- [DOT dataset metadata](https://data.transportation.gov/api/views/az4n-8mr2)
