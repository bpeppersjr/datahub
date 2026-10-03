# CMS hospital / NPPES overlap readiness

This pointer-free retained release evaluates exact candidate overlap between the governed CMS Hospital General Information projection and the retained NPPES organization/practice-location release. It performs no acquisition, network request, production enrollment, or runtime-pointer update.

## Method

Names use Unicode-safe NFKC normalization, uppercase conversion, `&` expansion to `AND`, preservation of Unicode letters and numbers, and whitespace collapse. Matching then requires exact equality of the normalized legal name and the complete reported street (including unit/additional text), city, state, and ZIP5. No fuzzy, phonetic, geospatial, proximity, or partial-address matching is performed.

Each result is classified by the number of distinct NPI candidates. Multiple matching NPPES location assertions for one NPI remain nested beneath that candidate, so they do not create false NPI ambiguity. Every assertion retains its NPPES record and candidate identifiers.

## Retained result

- Hospital directory rows: 5,419
- Eligible exact-match rows: 5,419
- One distinct NPI candidate: 236
- Multiple distinct NPI candidates: 317
- Unmatched: 4,866
- Distinct NPI candidate links: 1,667
- Location assertion links: 1,670

The conserved classifications sum to all 5,419 hospital rows. These are review candidates only. They do not establish identity, infer an NPI, verify a physical site, establish current operation, measure unique or active businesses, or prove completeness. Public redistribution is not authorized; the release is `local-review-only`.

## Reproduction and verification

Build with `node scripts/build-cms-hospital-nppes-overlap-readiness.mjs`. Verify an immutable manifest with `node scripts/verify-cms-hospital-nppes-overlap-readiness.mjs --manifest <path>`.

Publication uses canonical contained paths, exact input byte bindings, bounded gzip and JSONL processing, stable opened-handle reads, cooperative cancellation, exclusive lock/stage ownership checks, atomic release rename, closed inventories, content-addressed identity, and independent reconstruction. No `current.json` pointer is created.
