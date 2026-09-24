# Proposed additive CMS directory production — September 24, 2026

Fresh governed planning completed after implementation commit `3da77042d9a38e08ceddc16b9409d9c08491f7f2`. That commit publishes a separate national NCUA credit-union coverage dataset derived entirely from the retained, verified NCUA quarterly release and pinned Census ZIP/ZCTA geography. It adds non-additive management and exact-ZIP visibility but does not change the generic business registry, entity resolution, category totals, exports, site totals, or completeness measures.

- Run ID: `production-cms-directories-20260924-64`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260924-64.json`
- Exact confirmation SHA-256: `e56ed297956af6daf5e7e6fbe7aa1bfc27828f97a4ea761269d11818419d3a31`
- Planning implementation commit: `3da77042d9a38e08ceddc16b9409d9c08491f7f2`

The retained-only plan includes the governed 25-source production roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. The CMS rows remain local-review-only publisher directory records, not verified unique businesses, physical sites, or current operations.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has zero source-acquisition or network stages. No USPS dependency is selected.

Read-only exact-plan preflight returned `READY`; all current pins and retained inputs were reconstructed and verified, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 243,107,762,176 bytes and the current-output rebuild floor was 13,309,329,011 bytes.

The final repository suite passed 2,718 tests: 2,649 passed, 69 intentionally skipped, zero failed, zero cancelled, and zero todo. Lint passed with zero errors and four unrelated pre-existing warnings. Production web and desktop builds passed, the desktop control-plane smoke passed, and `npm audit --omit=dev` reported zero vulnerabilities. The required stop-and-launch recovery test returned healthy with exactly one loopback port 4300 listener.

Current derived release `national-ncua-credit-union-coverage-103a145b2abb72a3` is selected by pointer SHA-256 `6d5d56046bb1fc594fa71968fed8cb311e43a8ec277941b01c5282b693e75588` and manifest SHA-256 `d98264bd09cff6c2a54a5f594fbe8293256536f3f1cadc5f97399ce54dc2daa0`. Its immutable aggregate artifacts contain one national summary, 54 jurisdiction rows, and 37,855 ZIP5-union rows.

The NCUA layer counts 4,250 federally insured institutions and 22,445 accepted scoped U.S. locations as different measures. It preserves 9,401 positive ZIP5 rows, 28,454 denominator-only ZIP-union rows, 4,242 source main-office flags, 5,287 corporate-office rows, 17,158 branch-office rows, 9,571 reported ZIP+4 values, 22,295 record-level ZCTA matches, 150 nonpolygon records, 86 excluded non-federally-insured institutions, 332 excluded non-federally-insured locations, 49 outside-U.S. exclusions, five quarantined records, and five federally insured institutions without an accepted U.S. location.

The layer makes no all-credit-union, all-bank, all-financial-business, unique-business, current-operation, physical-site, public-access, current-hours, all-services, USPS-validity, generic-total, or nationwide-completeness claim. Institution counts are nonadditive across geography rows. Names, addresses, coordinates, charter/site identifiers, source record identifiers, telephone numbers, and reported hours are excluded from the published aggregate artifacts and UI.

The FDIC, FMCSA, SNAP, pharmacy, registry ZIP evidence-key delta, Census geography status, and broad-layer matrix retain their separate scopes. Broad organization coverage remains 11/51 jurisdictions admitted with 40 unresolved gaps. Independent retained-evidence review found that none of those 40 broad gaps can be closed from the currently retained authorized evidence. The four document-only inquiry proposals remain `PROPOSED`, `NOT APPROVED`, and `NO ACTION AUTHORIZED`.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 63 and every earlier CMS directory plan or approval are superseded. No production execution occurred while preparing this plan.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260924-64 --expected-plan-sha256 e56ed297956af6daf5e7e6fbe7aa1bfc27828f97a4ea761269d11818419d3a31
```
