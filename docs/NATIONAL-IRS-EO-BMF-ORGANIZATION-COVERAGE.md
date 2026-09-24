# National IRS EO BMF Organization Coverage

This retained-only layer publishes privacy-safe national, jurisdiction, and ZIP5 aggregates from the exact verified IRS Exempt Organizations Business Master File current cumulative extract already stored in the repository. It performs no source acquisition or network request and is not enrolled in production reconciliation.

The source release contains 1,957,340 rows. The governed source accepts 1,955,841 current-extract organization filing-address records, excludes 1,498 rows outside supported U.S. scope, and quarantines one invalid year-month row. The derived release preserves all 56 state and territory jurisdictions, 36,950 positive filing ZIP5 values, and the complete 39,217-row Census ZBP/ZCTA/source-ZIP union.

Published aggregates count organization records, separate ZIP+4 presence, record-level same-code ZCTA evidence, nonpolygon records, and the four mutually exclusive source exempt-status codes `01`, `02`, `12`, and `25`. Exact ZIP lookup uses a verified in-memory index after manifest and artifact binding; runtime reads do not replay the retained source partitions.

The output excludes organization names, filing addresses, EINs, source record identifiers, tax-profile details, quarantine records, and raw records. It makes no claim of every nonprofit or tax-exempt organization, unique businesses across sources, present-day operation, a verified physical site, public access, contribution deductibility beyond the source code, ownership relationships, current USPS validity, or nationwide completeness. Filing-address records are not added to generic business, entity, site, category, or export totals.

```powershell
npm run irs-eo:coverage:build
npm run irs-eo:coverage:verify
```
