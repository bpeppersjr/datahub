# Proposed additive CMS directory production — September 23, 2026

Fresh governed planning completed after implementation commit `241dd6d140ce158afcf6c9f1ca13038fdc5fce83`. That commit publishes a separate national FDIC BankFind coverage dataset derived entirely from the retained, verified FDIC institution/location release and pinned Census ZIP/ZCTA geography. It adds non-additive management and exact-ZIP visibility but does not change the generic business registry, entity resolution, category totals, exports, site totals, or completeness measures.

- Run ID: `production-cms-directories-20260923-63`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260923-63.json`
- Exact confirmation SHA-256: `7d23aa38788f09616a54c4c1293dc32861a5918f21a813568502bd0a191d7191`
- Planning implementation commit: `241dd6d140ce158afcf6c9f1ca13038fdc5fce83`

The retained-only plan includes the governed production source roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. The CMS rows remain local-review-only publisher directory records, not verified unique businesses, physical sites, or current operations.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has zero source-acquisition or network stages. No USPS dependency is selected.

Read-only exact-plan preflight returned `READY`; all current pins and retained inputs were reconstructed and verified, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 241,781,387,264 bytes and the current-output rebuild floor was 13,309,329,011 bytes.

The final repository suite passed 2,698 tests: 2,629 passed, 69 intentionally skipped, zero failed, zero cancelled, and zero todo. Lint passed with zero errors and three pre-existing warnings. Production web and desktop builds passed. The required stop-and-launch recovery test returned healthy with exactly one port 4300 listener.

Current derived release `national-fdic-bankfind-coverage-97f519d6265806ad` is selected by pointer SHA-256 `e9a2c2334abf4adebc5e94cd0db67aaee3b590976a370febe86fd8a5631bb681` and manifest SHA-256 `49e52f9c11735e989872e467fc984ef9a55df58cb2c0cddc6c8964bc330f52e0`. Its immutable artifacts contain one national summary, 58 jurisdiction rows, and 37,856 ZIP5-union rows.

The FDIC layer counts 4,238 active insured institutions and 77,285 accepted current indexed U.S. offices as different measures. It preserves 4,235 main offices, 73,050 branch offices, 18,018 positive ZIP5 values, 19,838 denominator-only ZIP-union rows, 77,283 retained coordinates, two missing coordinates, zero reported ZIP+4 values, 77,139 record-level ZCTA matches, 146 nonpolygon records, 802 foreign-location exclusions, and three active institutions without an accepted office.

The layer makes no all-bank, all-credit-union, all-financial-business, unique-business, current-operation, physical-site, public-access, current-hours, all-services, USPS-validity, generic-total, or nationwide-completeness claim. Institution counts are nonadditive across geography rows. Names, addresses, coordinates, certificate/location identifiers, and source record identifiers are excluded from the published aggregate artifacts and UI.

The FMCSA, SNAP, pharmacy, registry ZIP evidence-key delta, Census geography status, and broad-layer matrix retain their separate scopes. Broad organization coverage remains 11/51 jurisdictions admitted with 40 unresolved gaps. Independent retained-evidence review found that none of those 40 broad gaps can be closed from the currently retained authorized evidence. The four document-only inquiry proposals remain `PROPOSED`, `NOT APPROVED`, and `NO ACTION AUTHORIZED`.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 62 and every earlier CMS directory plan or approval are superseded. No production execution occurred while preparing this plan.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260923-63 --expected-plan-sha256 7d23aa38788f09616a54c4c1293dc32861a5918f21a813568502bd0a191d7191
```
