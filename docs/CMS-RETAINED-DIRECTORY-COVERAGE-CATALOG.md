# CMS retained directory coverage catalog

This is a separate immutable, release-only projection of the two already-retained CMS directory cohorts. It replays the fixed hospital and nursing-home native loaders before emitting aggregate-only jurisdiction counts. It performs zero source actions, does not change either source pointer, enroll either source in national reporting, or connect the data to production plans.

The catalog contains 56 jurisdiction rows in fixed order: the 50 states and D.C., followed by AS, GU, MP, PR, and VI. It conserves 5,419 hospital rows (5,354 state/D.C. and 65 territory), 14,690 nursing-home rows (14,680 state/D.C. and 10 territory), and 20,109 combined rows (20,034 state/D.C. and 75 territory). Its status is `published-pre-production-evidence`; both production and national-reporting-denominator enrollment are explicitly false.

`jurisdictions.jsonl` contains jurisdiction codes, denominator scope, and per-source/combined counts only. It contains no directory row names, source record identifiers, addresses, ZIP values, or coordinates. `sources.json` retains the two source release, selected-artifact, selection, and source-date lineage records. All output is local-review-only. Business, unique-business, physical-site, current-operation, and completeness measures remain null; geographic assignment and public export remain false.

Build and verify without acquisition or pointer changes:

```powershell
npm run cms:retained-directory-coverage:build
npm run cms:retained-directory-coverage:verify -- --manifest data/cms-retained-directory-coverage-catalog/releases/<release-id>/manifest.json --expected-manifest-sha256 <64-hex-sha256>
```

The builder writes two artifacts before writing the manifest, then atomically renames its owned staging directory into an immutable release. No `current.json` pointer is created.

## Canonical release

- Release: `cms-retained-directory-coverage-catalog-379f82bdf30a2834`
- Manifest SHA-256: `2eef0a317cb190968763fad2a2f90069f6b7a3fb86291ec6fde59a4f5671363c`
- Artifacts: `jurisdictions.jsonl`, `sources.json`, and manifest-last `manifest.json`
- Verified jurisdiction/source counts: 56 / 2
- Verified combined denominator: 20,109 retained directory rows
- Network requests, production enrollment, national reporting denominator enrollment, and current-pointer writes: zero/false
