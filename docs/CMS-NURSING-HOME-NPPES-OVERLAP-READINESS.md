# CMS nursing-home / NPPES overlap readiness

This pointer-free, retained-only `cms-nursing-home-nppes-overlap-readiness@1.1.0` release measures conservative exact-match candidates between the dated CMS nursing-home directory and the retained CMS NPPES organization layer. It performs no network request, acquisition, source mutation, current-pointer write, production enrollment, identity merge, or NPI inference.

## Matching contract

Each of the 14,690 retained nursing-home directory rows is compared with NPPES primary and non-primary organization practice locations. A candidate exists only when all of these values are exactly equal after one fixed normalization:

- nursing-home facility name and NPPES legal business name;
- complete street text, including the NPPES unit/additional component when present;
- city;
- two-letter reported state; and
- five-digit ZIP.

Text is normalized with Unicode NFKC, uppercasing, expansion of `&` to `AND`, preservation of Unicode letters and numbers, replacement of other runs by spaces, whitespace collapse, and trimming. Thus `CAF` and `CAFÉ` remain distinct, and non-Latin names remain matchable. No fuzzy, phonetic, abbreviation, geospatial, taxonomy, chain, ownership, or partial-address match is allowed. NPPES alternate names are not used in version 1.0.0.

The output has exactly one row per nursing-home source record. It classifies that row as `matched-one-distinct-npi-candidate`, `unmatched`, or `ambiguous-multiple-distinct-npi-candidates`. Ambiguity is measured by distinct NPI, while every exact primary or non-primary location assertion remains nested beneath its NPI candidate. Candidate records retain the nursing source-record/CCN references and NPPES NPI, record, organization, and provisional site identifiers so later review is reversible. The exact normalized key itself is not copied; its SHA-256 digest is retained.

Rows with incomplete fields or control characters remain conserved as unmatched and explicitly match-ineligible; they never receive a fabricated key or partial comparison.

## Claim boundary

A candidate is only deterministic string equality between two publisher-reported records. It is not an identity merge, verified NPI assignment, unique-business count, physical-site confirmation, current-operation finding, approved geocode, USPS-validity finding, or completeness measure. All outputs remain `local-review-only`; active-business and completeness totals stay null.

Verification reconstructs the result from the exact retained nursing selected artifact and every checksummed NPPES organization and non-primary-practice artifact. Compressed inputs are streamed from owned handles with compressed, decompressed-total, and per-line ceilings; abort listeners are removed after each stream. It checks handle/name identity before and after reads, source manifests, compressed artifact hashes and row counts, result conservation, content-addressed release identity, output bytes, closed inventory, canonical paths, clock bounds, and pointer-free publication. Stage and lock cleanup use owner tokens plus device/inode checks, delete only known owned files, and retain substituted or uncertain state for inspection.

```powershell
node scripts/build-cms-nursing-home-nppes-overlap-readiness.mjs
node scripts/verify-cms-nursing-home-nppes-overlap-readiness.mjs --manifest data/cms-nursing-home-nppes-overlap-readiness/releases/<release-id>/manifest.json
node --test runner/cms-nursing-home-nppes-overlap-readiness.test.mjs
```

## Retained release

The hardened full retained replay published and independently reconstructed successor release `cms-nursing-home-nppes-overlap-readiness-f57a299b2c0cccbcd038716b8dfe70adac8a7b43bdfaaab6b4f18ccf2634dfbe`, manifest SHA-256 `af73ebf41f534a7c07404f4458bd7a663fdc7774046b71fa79f1abe3e5047233`. Of 14,690 conserved nursing-home rows, 14,689 were match-eligible and one was explicitly ineligible; 285 had exactly one distinct-NPI candidate, 37 had multiple distinct-NPI candidates, and 14,368 had none. The 322 rows with candidates contain 390 distinct-NPI candidate links backed by 391 exact location assertions. These are readiness counts, not resolved identities or active-business totals. Earlier releases remain immutable but are not selected by the dataset registration.
