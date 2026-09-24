# National pharmacy industry coverage

This dataset projects the already retained and independently verified CMS NPPES community/retail pharmacy aggregates into a national industry-coverage contract. It performs no network or source action. Only this new derived dataset receives an atomic `current.json` pointer; upstream pointers are read-only.

The input is limited to Entity Type 2 organizations carrying NUCC taxonomy `3336C0003X`. Counts describe provider-reported primary practice-address evidence. They do not establish licensure, current operation, a physical pharmacy, unique businesses, or nationwide completeness. ZIP5 and ZIP4 remain separate; Census ZCTA membership is copied from the governed upstream projection and is not a new geocode.

Each immutable release contains one national `coverage-summary.json`, 56 rows in `jurisdictions.jsonl`, 38,686 rows in `zip5-coverage.jsonl`, and a manifest. It binds the exact Census geography pointer/release/manifest and separately reports 420 secondary address rows across 332 NPIs and 377 ZIP5s, including four secondary-only ZIP5s. Secondary rows are non-additive and are not published. Publication uses stable file-handle reads, exact hashes, conservation checks, run-scoped staging, atomic release rename, and compare-and-swap pointer replacement with rollback. No names, NPIs, street addresses, or county assignments are published.

Build with `npm run pharmacy:coverage:build`. Verify an immutable manifest with `npm run pharmacy:coverage:verify -- <manifest-path>`.
