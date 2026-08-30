# USDA FSIS active MPI establishment source

This connector adds establishments in the current USDA Food Safety and Inspection Service (FSIS) Meat, Poultry and Egg Product Inspection (MPI) Directory as a governed national source layer.

Official sources:

- [Meat, Poultry and Egg Product Inspection Directory](https://www.fsis.usda.gov/inspection/establishments/meat-poultry-and-egg-product-inspection-directory)
- [MPI API documentation](https://www.fsis.usda.gov/science-data/developer-resources/mpi-api)
- [Active MPI directory CSV](https://www.fsis.usda.gov/sites/default/files/media_file/documents/MPI_Directory_by_Establishment_Name.csv)
- [Establishment Demographic Data CSV](https://www.fsis.usda.gov/sites/default/files/media_file/documents/Dataset_Establishment_Demographic_Data.csv)

FSIS describes the active MPI directory as a current-edition listing of regulated meat, poultry, and/or egg-product establishments and says the data are updated weekly, typically on Mondays. The demographic supplement adds grants, establishment size, slaughter, processing, exemption, species, and production-category fields. The source page replaces earlier editions and also publishes a separate inactive-establishment file; this connector deliberately uses only the active pair.

## Acquire, build, and verify

FSIS returned HTTP 403 to ordinary HTTP clients and fresh headless Chromium during the August 30, 2026 validation. The official page and downloads worked in a normal browser. The connector therefore does not imitate a browser, rotate IP addresses, import cookies, or bypass provider controls.

1. Open the official directory page in a normal browser.
2. Under **Active Establishment MPI Data Files and Other References**, download:
   - `MPI_Directory_by_Establishment_Name.csv`
   - `Dataset_Establishment_Demographic_Data.csv`
3. Put both files in `datahub/downloads/fsis-mpi/`.
4. Record the one date printed beside both links and run:

```powershell
npm run fsis:build -- --source-date YYYY-MM-DD
npm run fsis:verify
```

Alternate input paths remain inside `datahub` and can be supplied explicitly:

```powershell
npm run fsis:build -- `
  --source-date 2026-08-24 `
  --directory downloads/fsis-mpi/MPI_Directory_by_Establishment_Name.csv `
  --demographic downloads/fsis-mpi/Dataset_Establishment_Demographic_Data.csv
```

The build fails closed on an unrecognized schema fingerprint, missing required field, duplicate establishment ID, unequal source counts, one-to-one join mismatch, source date after retrieval, low count floor, or excessive quarantine rate. Both raw files, their SHA-256 values, source date, exact schemas, and counts are pinned before normalization. Publication is run-scoped; `current.json` changes only after the complete release passes quality gates.

## Scope and identity

Each accepted `establishment_id` produces one provisional physical site and operating establishment. FSIS establishment ID and establishment number remain separate typed external identifiers. The connector does not create a legal organization from the establishment name, infer ownership or parent company, or merge records across sources.

The normalized layer retains:

- establishment name and semicolon-delimited DBAs as separate names;
- physical address, ZIP5/ZIP+4, county name and county FIPS;
- point coordinates and ZCTA reference;
- business phone, FSIS grant date, district, circuit, and HACCP size;
- directory activities;
- active grant classes and their source edit dates;
- positive demographic operation flags and published categorical values.

FSIS exports leading-zero ZIP and county-FIPS values as shorter numeric text in the current CSV. The connector deterministically left-pads valid three-to-five-digit postal values to ZIP5 and four-to-five-digit county codes to five-digit FIPS. It does not claim current USPS validity.

The source `duns_number` column is retained only in the internal raw CSV. It is excluded from normalized and registry output pending a field-specific redistribution review.

## Status semantics and coverage

`listed-in-fsis-active-mpi-directory-as-of-release` means only that the establishment appears in the current active directory pair for the pinned source date. It is not independent proof of general business operating status, public access, current hours, legal ownership, parent company, or every product made.

`derived/zip-coverage.jsonl` preserves the Census ZBP/ZCTA union and adds any accepted FSIS ZIP. ZIPs with no FSIS row remain visible as source-specific gaps; absence does not mean no food establishment or no business.

The validated August 24, 2026 pair contained 7,237 directory rows and 7,237 one-to-one demographic rows across 56 states, the District of Columbia, and U.S. territory codes. These counts are evidence for that pinned source pair, not permanent constants.
