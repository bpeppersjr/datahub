# Proposed additive CMS directory production — September 24, 2026

> Superseded by Plan 68 (`production-cms-directories-20260924-68`, SHA-256 `f8700a7f84f48529bb1aff4a9ec6f11e1d249517528186d0f2ce9541a47aeb73`). Plan 67 is retained only as immutable planning history and is not approved for execution.

Fresh governed planning completed after implementation commit `dfc028f609ed4f524a16a045835755733605081e`. That commit publishes a separate national IRS EO BMF current-extract organization filing-address aggregate coverage dataset derived entirely from the retained, verified IRS release and pinned Census ZIP/ZCTA geography. It adds non-additive management and exact-ZIP visibility but does not change the generic business registry, entity resolution, category totals, exports, site totals, or completeness measures.

- Run ID: `production-cms-directories-20260924-67`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260924-67.json`
- Exact confirmation SHA-256: `b1a16e64a91b1da635273b2836f8ced72ca12f0079f92bee82f40f26a5d73b64`
- Planning implementation commit: `dfc028f609ed4f524a16a045835755733605081e`

The retained-only plan includes the governed 25-source production roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. The CMS rows remain local-review-only publisher directory records, not verified unique businesses, physical sites, or current operations.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has zero source-acquisition or network stages. No USPS dependency is selected.

Read-only exact-plan preflight returned `READY`; all current pins and retained inputs were reconstructed and verified, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 242,394,271,744 bytes and the current-output rebuild floor was 13,309,329,011 bytes.

The final repository suite passed 2,790 tests: 2,721 passed, 69 intentionally skipped, zero failed, zero cancelled, and zero todo. Lint passed with zero errors and four unrelated pre-existing warnings. Production web and desktop builds passed, the desktop control-plane smoke passed, and `npm audit --omit=dev` reported zero vulnerabilities. The required stop-and-launch recovery test returned healthy with exactly one loopback port 4300 listener.

Current derived release `national-irs-eo-bmf-organization-coverage-cf09e08b19c01912` is selected by pointer SHA-256 `d7cf248fb1e3e2f10e966a19818b3cf2c6603eb123c463d90b33e7661e6b4fe1` and manifest SHA-256 `0106b15988a76a48f2662abcdf767e86b5f8e4fcdc57f04a4b1243ecc8f1316e`. Its immutable aggregate artifacts contain one national summary, 56 jurisdiction rows, and 39,217 ZIP5-union rows.

The IRS EO BMF layer starts from 1,957,340 source rows and the identical source-page claimed count. It accepts 1,955,841 current-extract organization filing-address records, excludes 1,498 rows outside supported U.S. scope, and quarantines one invalid year-month row. It preserves 36,950 positive ZIP5 rows, 2,267 denominator-only ZIP-union rows, 1,812,739 record-level ZCTA matches, 143,102 nonpolygon records, 5,103 positive source ZIPs without ZCTA membership, and 3,139 positive source ZIPs without published ZIP Business Patterns. Every accepted record preserves ZIP5 and a separate reported ZIP+4 value. All 51 state/District jurisdictions have positive evidence; territory counts are AS 79, GU 160, MP 107, PR 2,515, and VI 547.

The four source exempt-status measures are mutually exclusive and conserve the accepted cohort: code `01` has 1,947,718 records, code `02` has 640, code `12` has 6,637, and code `25` has 846. These codes remain source tax-status evidence and do not establish current operations, physical premises, public access, or contribution deductibility beyond the source field.

The layer makes no all-nonprofit, all-tax-exempt-organization, all-business, unique-business-across-sources, current-operation, verified physical-site, public-access, ownership, premise-geocode, USPS-validity, generic-total, or nationwide-completeness claim. Organization names, filing addresses, EINs, source record identifiers, tax-profile details, raw records, and quarantine records are excluded from the published aggregate artifacts and UI.

The EPA ECHO, FSIS, NCUA, FDIC, FMCSA, SNAP, pharmacy, registry ZIP evidence-key delta, Census geography status, and broad-layer matrix retain their separate scopes. Broad organization coverage remains 11/51 jurisdictions admitted with 40 unresolved gaps. Independent retained-evidence review found that none of those 40 broad gaps can be closed from the currently retained authorized evidence. The four document-only inquiry proposals remain `PROPOSED`, `NOT APPROVED`, and `NO ACTION AUTHORIZED`.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 66 and every earlier CMS directory plan or approval are superseded. No source acquisition, network access, or production execution occurred while preparing this plan.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260924-67 --expected-plan-sha256 b1a16e64a91b1da635273b2836f8ced72ca12f0079f92bee82f40f26a5d73b64
```
