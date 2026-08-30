# IRS Exempt Organizations Business Master File

This connector builds a governed organization layer from the four monthly IRS Exempt Organizations Business Master File (EO BMF) regional CSVs. It publishes organizations in the current cumulative extract when their row has a supported U.S. state or territory and a valid reported filing address. It must not be described as a complete list of nonprofits, exempt organizations, physical establishments, employers, or U.S. businesses.

Official sources:

- [IRS EO BMF page and regional files](https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf)
- [IRS EO BMF data dictionary](https://www.irs.gov/pub/foia/ig/tege/eo-info.pdf)
- [IRS public disclosure datasets](https://www.irs.gov/charities-non-profits/public-disclosure-datasets-and-downloads)

## Commands

Discover and stream the current official files directly into a governed release:

```powershell
npm run irs-eo:build
npm run irs-eo:verify
```

Reuse four already completed official CSVs inside `datahub`:

```powershell
npm run irs-eo:build -- --source-directory downloads/irs-eo-bmf
npm run irs-eo:verify
```

The build discovers the current source posting date and claimed record count from the IRS page, requires exactly `eo1.csv` through `eo4.csv`, rejects redirects, caps each file at 800 MB, pins the exact 28-column schema fingerprint, rejects duplicate nonblank EINs, reconciles every source row, and publishes `current.json` only after all quality gates pass.

## Published contract

Each accepted EIN creates one provisional organization candidate. The layer includes:

- EIN and public organization name;
- `SORT_NAME` as a source-designated secondary name when distinct;
- reported filing or headquarters address, including ZIP+4 when present;
- exempt-status, subsection, classification, organization, affiliation, group exemption, ruling, deductibility, foundation, activity, NTEE, filing-requirement, tax-period, and accounting-period source fields;
- Census ZCTA linkage when the filing ZIP has a polygon;
- source-specific current-extract status, source posting date, checksum-bound provenance, and public export policy.

The filing address generally represents headquarters, but it can be a mailing address or P.O. box and may not represent an operating location. The connector therefore creates no physical site or establishment. Group and affiliation codes remain source classifications; they do not create parent, subordinate, chapter, ownership, or control relationships.

The `ICO` in-care-of field can identify a person such as an officer or director. It remains only in internal raw source CSVs and is excluded from normalized and registry records. Asset, income, and revenue amounts also remain internal pending a separate time-aware financial model.

## Status and coverage

The connector accepts the EO BMF status codes documented for the current extract: `01`, `02`, `12`, and `25`. Current-extract membership and those federal tax-status codes are not independent proof of current operations, public access, a current physical location, or contribution deductibility beyond the reported code.

The live CSV domain also contains `0` for organization type, affiliation, and deductibility, plus organization-type code `6`, even though the current published dictionary defines neither meaning. The connector preserves those exact codes with `source-code-not-defined-in-current-published-data-dictionary` and makes no semantic inference. Source sentinels `RULING=000000` and `ACCT_PD=00` are retained as measured release counts and normalized to unknown dates rather than invented dates.

IRS states that the current file is cumulative and removes organizations from the publicly accessible file upon revocation. The extract does not include every potentially exempt organization: gaps include self-declared organizations, churches and other organizations that were not required to apply and did not apply, and split-interest trusts.

`derived/zip-coverage.jsonl` preserves the Census ZBP/ZCTA union and adds any accepted five-digit U.S. ZIP reported as a filing address. A zero means no accepted organization filing address appeared in that ZIP for this snapshot; it does not mean the ZIP has no nonprofit, business, or operating establishment. Current USPS ZIP validity remains unverified pending an authoritative denominator.

## Validated live release

The independently verified 2026-08-30 build produced dataset release `irs-eo-bmf-20260830-170801603Z-33a33e6c` from source release `irs-eo-bmf-2026-08-11-d272cdb9c6c4afef`. The four official CSVs totaled 339,854,475 bytes and reconciled exactly to the IRS page's 1,957,340-record claim:

- `eo1.csv`: 278,014 records, 48,629,769 bytes, SHA-256 `6749085dd79a822f7b50a6dae41b055ad2c691232b30536a0583aeab65c9063a`;
- `eo2.csv`: 719,134 records, 125,728,575 bytes, SHA-256 `5abab7fdd1a0a7f8e0f39d836208a182ebd7e2560aac7847e995d5eb1a2fa195`;
- `eo3.csv`: 955,286 records, 164,634,273 bytes, SHA-256 `47371e01f77926dce01ebbeeade92f5f3a49f1018429017ac0ed1f3063f3c9d5`;
- `eo4.csv`: 4,906 records, 861,858 bytes, SHA-256 `8a5288f8ccce9dc8d6bbfc656f9af039c113d017b89a260fd7b58011e28b39e1`.

The connector published 1,955,841 organizations across 36,950 filing ZIPs and all 56 supported states and territories. It counted 1,498 international or unsupported-address rows as scope exclusions and quarantined one domestic row whose ruling value was the invalid year-month `190900`, an effective quarantine rate of approximately 0.0000511%. The 39,217-row ZIP union retains zero-count denominator rows.

Observed raw-code counts are preserved in the release manifest. They include 10,369 organization-type `0` rows, 2,646 organization-type `6` rows, 5,502 affiliation `0` rows, and 33,241 deductibility `0` rows. The source also contained 11,547 `RULING=000000` and 52 `ACCT_PD=00` sentinels; these became explicit unknown values rather than fabricated dates.
