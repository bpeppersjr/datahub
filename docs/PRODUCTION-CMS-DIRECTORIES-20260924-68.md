# Proposed additive CMS directory production — September 24, 2026

Fresh governed planning completed after implementation commit `a0e7f73667f30d28c4726b0f510db0453654c10c`. That commit publishes a separate national CMS NPPES active Entity Type 2 organization practice-location aggregate coverage dataset derived entirely from the retained, verified August 2026 V2 NPPES release and pinned Census ZIP/ZCTA geography. It adds non-additive management and exact-ZIP visibility but does not change the generic business registry, entity resolution, category totals, pharmacy totals, exports, site totals, or completeness measures.

- Run ID: `production-cms-directories-20260924-68`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260924-68.json`
- Exact confirmation SHA-256: `f8700a7f84f48529bb1aff4a9ec6f11e1d249517528186d0f2ce9541a47aeb73`
- Planning implementation commit: `a0e7f73667f30d28c4726b0f510db0453654c10c`

The retained-only plan includes the governed 25-source production roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. The CMS rows remain local-review-only publisher directory records, not verified unique businesses, physical sites, or current operations.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has zero source-acquisition or network stages. No USPS dependency is selected.

Read-only exact-plan preflight returned `READY`; all current pins and retained inputs were reconstructed and verified, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 242,153,140,224 bytes and the current-output rebuild floor was 13,309,329,011 bytes.

The final repository suite passed 2,815 tests: 2,746 passed, 69 intentionally skipped, zero failed, zero cancelled, and zero todo. Lint passed with zero errors and four unrelated pre-existing warnings. Production web and desktop builds passed, the desktop control-plane smoke passed, and `npm audit --omit=dev` reported zero vulnerabilities.

Current derived release `national-cms-nppes-organization-practice-location-coverage-18b42dcc8501daf8` is selected by pointer SHA-256 `c75a3a1139cffe816bf2988062d222a942635a1ce02aef7d92f1317a22c39d88` and manifest SHA-256 `851eaf6747aecf79e912f49772001da6902bb3899d9f312ca98ce4943ea60c9f`. Its immutable aggregate artifacts contain one national summary, 61 jurisdiction rows, and 38,686 ZIP5-union rows.

The retained source contains 9,726,865 main rows and 1,959,633 active or reactivated organization NPIs; 7,415,294 active individual NPIs are excluded. It retains 1,958,089 organization primary locations with valid U.S. ZIP5 and separately accounts for 1,544 organizations without a valid U.S. primary ZIP.

The practice-location source cohort conserves exactly: 1,241,921 source rows equal 130,691 accepted non-primary practice locations, 1,109,593 excluded rows, 31 rejected rows, and 1,606 deduplicated rows. Accepted primary and non-primary measures are mutually exclusive and total 2,088,780 reported practice-location records.

The aggregate preserves 28,056 positive ZIP5 rows and 10,630 denominator-only ZIP-union rows. Of accepted practice-location records, 1,908,009 contain a separate ZIP+4, 2,081,726 have same-code ZCTA evidence, and 7,054 are nonpolygon records. There are 2,177 positive source ZIPs without ZCTA membership and 1,465 positive source ZIPs without published ZIP Business Patterns.

All 51 state/District jurisdictions have positive evidence. The five U.S. territories, three military postal jurisdictions, and two associated states remain separately counted. No state, county, premise, ownership, or current-operation inference is introduced.

The layer makes no licensure, credentials, all-healthcare-organization, all-business, unique-business-across-sources, current-operation, verified physical-site, public-access, ownership, premise-geocode, USPS-validity, generic-total, pharmacy-total, or nationwide-completeness claim. Organization names, NPIs, addresses, telephone numbers, taxonomies, source record identifiers, raw records, and quarantine records are excluded from published aggregate artifacts and UI.

The IRS EO BMF, EPA ECHO, FSIS, NCUA, FDIC, FMCSA, SNAP, pharmacy, registry ZIP evidence-key delta, Census geography status, and broad-layer matrix retain their separate scopes. Broad organization coverage remains 11/51 jurisdictions admitted with 40 unresolved gaps. Independent retained-evidence review found that none of those 40 broad gaps can be closed from the currently retained authorized evidence. The four document-only inquiry proposals remain `PROPOSED`, `NOT APPROVED`, and `NO ACTION AUTHORIZED`.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 67 and every earlier CMS directory plan or approval are superseded. No source acquisition, network access, or production execution occurred while preparing this plan.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260924-68 --expected-plan-sha256 f8700a7f84f48529bb1aff4a9ec6f11e1d249517528186d0f2ce9541a47aeb73
```
