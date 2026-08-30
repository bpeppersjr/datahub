# USPS operational ZIP assignment evidence

This connector creates a governed, current 5-digit ZIP assignment denominator from official USPS PostalPro resources while keeping USPS rows out of Git and public exports by default.

## Why two files are required

PostalPro publishes a current `AREADIST_ZIP5` file of Area/District 5-digit ZIP assignments and a separate `AISUZIPS` routing file. The latter is not a safe denominator by itself. A 2026-08-30 research reconciliation of the 2026-08 resources found:

- 41,523 unique Area/District assignment rows;
- 41,831 unique AISU routing rows;
- all 41,523 Area/District ZIPs present in AISU; and
- 308 AISU-only routing rows, including many routing placeholders ending in `00`.

The connector therefore uses the Area/District set as its operational assignment denominator and retains only the count of AISU-only rows as reconciliation evidence. It does not classify those extra rows as active, inactive, or deliverable.

## Semantics

An included row means only that its ZIP appears in the current USPS-published Area/District 5-digit assignment file. It does not prove:

- that a particular address is deliverable;
- a delivery type such as street, PO Box, unique, or military;
- preferred city or state names;
- ZIP+4 ranges; or
- a Census ZCTA polygon.

ZIP Codes are USPS routing constructs. Census ZCTAs remain a separate geographic evidence layer.

## Authorization and publication boundary

The USPS general site terms limit downloaded material to personal non-commercial home use, page-specific grants, or express written permission. The PostalPro resource pages expose the files publicly but do not state a broader redistribution grant.

The build command consequently refuses to make a live request until one of these truthful bases is declared:

```powershell
npm run usps-zips:build -- --use-basis personal-noncommercial-home-use
```

or, when a reviewed USPS permission covers the intended use:

```powershell
npm run usps-zips:build -- --use-basis usps-written-permission --permission-reference USPS-LETTER-2026-001
```

The permission reference is an internal, non-secret record identifier—not the permission document or confidential content.

Raw source pages, source text, and normalized ZIP rows are written below `data/zip-validity/usps-operational-zips/`, which is ignored by Git. A written permission basis changes normalized rows to `permission-governed`; it does not automatically make them public. Any export still has to apply the reviewed permission.

## Validation and verification

The build requires:

- exact HTTPS host allowlisting for `postalpro.usps.com`;
- denied redirects;
- one exact current file link from each official resource page;
- a shared source storage month across all three resources;
- the official AISU 1-5 ZIP and 6-10 AISU layout declaration;
- 10-character AISU and 54-character Area/District fixed-width records;
- valid, unique 5-digit ZIPs;
- at least 30,000 Area/District assignments; and
- every Area/District ZIP to exist in AISU.

Publication is atomic and immutable. The verifier independently checks artifact paths, sizes, SHA-256 hashes, normalized counts, uniqueness, conservative semantic flags, and row-level export policy.

```powershell
npm run usps-zips:verify
```

## Official references

- [PostalPro AIS Viewer](https://postalpro.usps.com/address-quality/ais-viewer)
- [Area/District 5-digit ZIP assignments](https://postalpro.usps.com/areadist_ZIP5)
- [AISU ZIP file](https://postalpro.usps.com/ais-viewer/aisuzips)
- [AISU record layout](https://postalpro.usps.com/ais-viewer/aisulout)
- [USPS site terms of use](https://about.usps.com/who/legal/terms-of-use.htm)
- [USPS AIS copyright/license resource](https://postalpro.usps.com/AISCopyright_License)
