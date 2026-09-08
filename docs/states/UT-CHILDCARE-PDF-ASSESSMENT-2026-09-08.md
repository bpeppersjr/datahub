# Utah childcare: retained PDF layout assessment

The web reader's prior safe-open error did not establish a publisher denial. A bounded native GET of the exact [DLBC-linked report](https://dlbc.utah.gov/wp-content/uploads/All-Child-Care-Licensing-Facilities-Report-September-2026.pdf) succeeded on September 8, 2026, with redirects/credentials disabled, a 30-second timeout and a 500,000-byte cap. It returned 332,869 bytes matching the earlier ETag and modification header. Only this one report was fetched for source validation, not an app collection. The original is retained unmodified with its request receipt in the hash-addressed assessment directory recorded by the [machine-readable layout assessment](UT-CHILDCARE-LAYOUT-2026-09-08.json).

## Format and scope findings

PDF text extraction and visual review followed the PDF inspection skill. Two independent coordinate-based passes agreed on 31 landscape pages, 13 table columns, 1,961 data baselines and 1,961 distinct extracted facility IDs. Exactly 422 rows have the center license category. Other categories—including exempt centers, hourly centers, preschools and family/home programs—remain separate. These are extraction observations, not verified active-business counts or production-normalized records.

The 422 center rows all contain primary address, city, state, county and five-digit-shaped ZIP text; every reported state is UT. Secondary address is blank in 367. Capacity and both date columns pass shape checks only. Initial regulation is not business opening; expiration is not proof of present operation. The table has no coordinate columns. Future normalization must preserve ZIP5/ZIP4 separately and leave unavailable points and unverified address roles explicit.

## Parsing and notice boundary

Generic table extraction merges cells; whitespace splitting can concatenate adjacent columns. Use character coordinates against the observed grid, verify headers and column geometry on every page, conserve rows before filtering, and reject ambiguous cells rather than guessing. Rendered pages 1, 2, 16 and 31 were inspected; intermediate-page headers were not consistently visible although their extracted text matched across all 31 pages. Do not modify the source PDF to repair its presentation.

The extracted content consists of repeated headings and table rows; no additional textual use notice, attachment or annotation entry was found. This is not an exhaustive legal-rights determination. Preserve the original with [Utah's observed informational-use conditions](UT-CHILDCARE-USE-2026-09-08.md), source URL, edition and hash. Exclude phone numbers from the future selected derivative; do not infer or recover omitted home addresses.

## Next implementation

Build a bounded, versioned PDF decoding/layout-validation prerequisite and synthetic acceptance fixtures before a dependent collector. Include shifted columns, merged glyphs, missing/repeated headers, malformed IDs, duplicate rows, page omissions, unknown categories, missing fields and cancellation. Compare a complete observed file hash/length, not only HTTP dates. Reuse this retained assessment document for development; do not refetch it for parser iteration. A future app acquisition receipt remains required before claiming production collection, and a future report edition requires renewed layout/source checks rather than assuming these counts still apply.

Once validated and implemented, hand routine acquisition to Co*Tive's standalone workers. Agents must not remain occupied supervising downloads. The app owns implemented resource limits, provider pacing, progress and recovery; available memory does not remove source-specific limits. Record an accepted operation and persisted receipt at handoff, and do not represent an unimplemented refresh or retry capability as available.

## Verification

The repository check completed with 1,377 tests: 1,366 passed, 11 skipped and zero failures; build and desktop control-plane smoke also passed. TypeScript validation passed, the production dependency audit reported zero vulnerabilities, and all 82 pending production pins remained unchanged. Layout conservation and retained artifact hash checks passed. This documentation-only increment does not implement a Utah production collector.
