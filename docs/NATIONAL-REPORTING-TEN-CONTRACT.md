# Ten-source reporting candidate

New source-service files only. The existing eight-source catalog, projection and application route remain unchanged. `national-reporting-ten@1.0.0` means representation among ten enrolled datasets, never percentage of all businesses collected or complete industry coverage.

The catalog derives its first eight exact mappings/labels/scopes from the strictly validated existing catalog. Seven use location-profile evidence; IRS retains its organization-filing-address route. Two explicit directory entries follow: `national-cms-hospitals` / `cms_hospital_directory_reporting` and `national-cms-nursing-homes` / `cms_nursing_home_directory_reporting`. Both have null profile IDs. No fake profile, shared business total or source-source entity reconciliation is introduced.

Directory rows retain fixed source denominators: hospitals 5,419 all / 5,354 states+DC / 65 territories; nursing 14,690 / 14,680 / 10. The projection requires all 56 state/territory rows, exact state/DC and territory sum conservation, zero unknown-state rows for these fixed cohorts, matching metric percentages and source claims. Display contains 51 states/DC; territory denominators remain visible. Directory shares of all source rows and of state/DC source rows have distinct fields. Group percentages describe enrolled-dataset presence, not industry completeness. Counts of different row units are never summed. Unknown original-source counts remain null, measured zero remains zero, and a missing CMS extension makes the native view unavailable.

## Real activation without code changes

`readNationalReportingTen({signal?})` reads only the fixed `config/national-reporting-ten-enrollment.json`. This file is deliberately absent now. After a successful, reviewed production build containing both CMS sources, the integrator can publish this closed object:

```json
{
  "schemaVersion": "national-reporting-ten-enrollment@1.0.0",
  "denominatorVersion": "national-reporting-ten@1.0.0",
  "predecessorCatalogSha256": "<actual existing eight-source catalog SHA256>",
  "coveragePointerSha256": "<actual selected current pointer SHA256>",
  "coverageManifestSha256": "<actual new coverage manifest SHA256>",
  "productionReceipt": {
    "path": "data/reconciliations/production-runs/<actual-run-id>/receipt.json",
    "sha256": "<actual successful production receipt SHA256>"
  }
}
```

Placeholders are documentation only and fail validation. There is no caller-supplied pointer, source, receipt, catalog or transport override. No enrollment is created by this slice. The reader requires the exact selected current pointer and manifest hashes, the receipt's eight ordered successful build/verify stages, zero exits and matching registry/coverage outputs. Both CMS coverage declarations must bind that same registry and their exact reviewed source manifest/selected hashes. Original eight counters and CMS counters come from the same newly selected coverage snapshot, never mixed old/new releases.

The shared snapshot reader checks bounded artifact hashes, ownership, source lineage and supported coverage transformation. The new reader separately rechecks enrollment, receipt and predecessor catalog after projection and rechecks the selected snapshot around the IRS evidence read. Source replay and stage-log replay are not performed for these reads: the exact receipt records historical verification; current checks establish aggregate/enrollment integrity, not fresh publisher authentication or source currency. A changed pointer or invalid enrollment returns explicit unavailable rather than silently falling back to eight, treating missing CMS as zero or reading an old release as current.

Consumers must preserve `internal` when any selected aggregate is internal; otherwise local-review-only remains. No acquisition, scheduler or production pointer writes exist. Nursing provenance identifies retained recovery; the original acquisition is still failed. County, point, business/site and national completeness claims stay unverified/unknown.

## Evidence boundary and next acceptance

Ten focused tests and owned-file ESLint pass. Coverage includes exact original-eight mappings, immutable catalog/fixture identity, ten-source representation, distinct directory totals and shares, missing/zero/territory conservation, source/metric drift, same-snapshot profile and IRS routes, restrictive policy, closed enrollment, exact successful receipt stage/output contract, absent native enrollment and pre-abort. Synthetic receipt and projection entry points remain explicitly labeled synthetic; neither is a native enrollment bypass.

The file-backed tests exercise the same enrolled-reader implementation through `readNationalReportingTenWithFixtureRoot`, confined beneath data/tmp. They write synthetic coverage/registry/IRS-summary/receipt/catalog/enrollment files with their actual hashes, execute the ordinary bounded snapshot reader and actual IRS source-summary route, and obtain 51-state output explicitly labeled `synthetic-fixture-only` with historical production verification false. No real source receipt or production output is fabricated or installed. Missing/malformed enrollment, mismatched old pointer, rehashed missing CMS declaration and failed receipt stage all return unavailable. Fixture-only checkpoint mutation after projection rejects pointer, manifest, receipt, enrollment, catalog and IRS summary drift. IRS evidence is reread and compared before returning, alongside final snapshot/receipt/enrollment/catalog checks. Fixture roots and files are cleaned after tests; native callers cannot supply the root or checkpoint.

No successful native ten-source enrollment can be claimed before the real production release exists. After that release, publish actual reviewed pins, run one bounded native read and verify all 51 display rows against both coverage extensions before the app coding lane wires the route/UI. Existing eight-source history, labels and API results remain available unchanged throughout.
