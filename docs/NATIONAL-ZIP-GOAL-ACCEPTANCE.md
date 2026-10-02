# National ZIP goal acceptance

`npm run goal:zip:acceptance` executes a read-only evidence check. It keeps three different measures separate:

1. **Census ZCTA spatial denominator:** complete membership of the selected Census ZCTA5 index, reconciled to the geography source-available count and coverage denominator/member-set hash. The current selected set has 33,791 members. This verifies index membership and reports the manifest's polygon-release completeness; it does not reread polygon geometry or establish USPS routing validity.
2. **Source-reported ZIP membership:** the current registry's exact checksum-bound ZIP artifact, including 48,194 union members, 47,995 with source contributions and 199 denominator-only rows. The report includes deterministic member-set hashes. The union includes source placeholders such as `00000`; membership does not mean operational validity, deliverability, current business activity or all-business completeness.
3. **Authoritative current operational USPS denominator:** the separate registry/coverage declaration and USPS candidate catalog's production-admission flag. Currently the denominator is null and admission is false. Neither Census completeness nor source contribution replaces this missing evidence.

## Executable claims

```powershell
npm run goal:zip:acceptance
npm run goal:zip:acceptance -- --claim complete-selected-census-zcta-denominator
npm run goal:zip:acceptance -- --claim source-reported-zip-membership
npm run goal:zip:acceptance -- --claim every-valid-usps-zip
npm run goal:zip:acceptance -- --claim every-active-business-by-valid-zip
```

The first three claims can pass while operational ZIP evidence remains unavailable. The last two return a structured rejection and exit **2**. Missing/corrupt/inconsistent input or cancellation exits **1**; a truthful accepted report exits **0**. Rejection is the successful enforcement of the acceptance contract, not an instruction to acquire data or suppress narrower coverage reports.

Version `national-zip-goal-acceptance@1.0.0` never approves universal operational ZIP completion. A null authoritative denominator and a non-admitted candidate are independently reported blockers. Even changing both fields is insufficient: this version has no governed authoritative operational member-set verifier. A future separately reviewed contract must verify that membership and currency; listing every operational ZIP would still not prove every active business has been collected.

## Evidence and limits

The executable binds current registry, coverage and geography pointers and manifest bytes, cross-release dependency hashes, the USPS candidate dataset catalog bytes, the Census ZCTA index, and registry ZIP membership artifact. Identical repeated registry geography dependencies are supported; conflicting repeats fail. It rereads pointers/catalog/manifests after the membership scan and rejects changes. Reads use the existing contained, single-link, checksum-on-consumed-bytes readers with AbortSignal propagation. JSON metadata is capped at 4 MB, ZCTA input at 50 MB, registry ZIP input at 1 GB, and membership sets at 100,000 rows. No output artifact or pointer is written.

Coverage ZIP rows, raw business sources, polygon geometry, USPS candidate artifact contents and source currency are not independently replayed by this check. These exclusions appear in the result rather than being implied verified. ZIP5 and ZIP4 stay separate; aggregate ZIP membership requires null ZIP4 and never assigns ZIP4 geometry. Business/current-operation/completeness counts remain null, public export remains false, and no production, UI, enrollment or publisher behavior changes.

Focused tests cover distinct successful/rejected claims, both independent USPS blockers, future flags not bypassing membership verification, inconsistent Census/source membership, altered denominator declarations, cancellation, actual retained counts, and CLI exit status. Run `node --test runner/national-zip-goal-acceptance.test.mjs`.
