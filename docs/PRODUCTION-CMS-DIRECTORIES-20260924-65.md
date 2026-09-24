# Proposed additive CMS directory production — September 24, 2026

> Superseded by Plan 66 (`production-cms-directories-20260924-66`, SHA-256 `1b404088f223f66765eb0f52fdb153c6790ba6b870191a497ee0c1d30f0fa154`). Plan 65 is retained only as immutable planning history and is not approved for execution.

Fresh governed planning completed after implementation commit `9ac08e851670b5e3ea1b43449a3de84f416d9c34`. That commit publishes a separate national USDA FSIS active-establishment aggregate coverage dataset derived entirely from the retained, verified FSIS Meat, Poultry and Egg Product Inspection Directory release and pinned Census ZIP/ZCTA geography. It adds non-additive management and exact-ZIP visibility but does not change the generic business registry, entity resolution, category totals, exports, site totals, or completeness measures.

- Run ID: `production-cms-directories-20260924-65`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260924-65.json`
- Exact confirmation SHA-256: `be444ea1807628464a24ae53783a956625d02755b173f9164d9a5e8c8e6f5b22`
- Planning implementation commit: `9ac08e851670b5e3ea1b43449a3de84f416d9c34`

The retained-only plan includes the governed 25-source production roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. The CMS rows remain local-review-only publisher directory records, not verified unique businesses, physical sites, or current operations.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has zero source-acquisition or network stages. No USPS dependency is selected.

Read-only exact-plan preflight returned `READY`; all current pins and retained inputs were reconstructed and verified, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 242,967,113,728 bytes and the current-output rebuild floor was 13,309,329,011 bytes.

The final repository suite passed 2,739 tests: 2,670 passed, 69 intentionally skipped, zero failed, zero cancelled, and zero todo. Lint passed with zero errors and four unrelated pre-existing warnings. Production web and desktop builds passed, the desktop control-plane smoke passed, and `npm audit --omit=dev` reported zero vulnerabilities. The required stop-and-launch recovery test returned healthy with exactly one loopback port 4300 listener.

Current derived release `national-fsis-active-establishment-coverage-6583d7aea98f1ce8` is selected by pointer SHA-256 `e6cd00b4fdbc4ee48f3751fa8c2bf3c854056a4d8cb65b960cdc263a12618f00` and manifest SHA-256 `5161d685e1f2a974f1a7db1307636ed4293d99f4ffce70254b7d24d9025796fc`. Its immutable aggregate artifacts contain one national summary, 56 jurisdiction rows, and 37,859 ZIP5-union rows.

The FSIS layer counts 7,237 accepted source-defined active-directory records. It preserves 4,367 positive ZIP5 rows, 33,492 denominator-only ZIP-union rows, 113 reported ZIP+4 values, 7,124 missing ZIP+4 values, 7,237 source coordinates, 7,152 record-level ZCTA matches, 85 nonpolygon records, 72 positive source ZIPs without ZCTA membership, 100 positive source ZIPs without published ZIP Business Patterns, 51 state/District rows, five territory rows, and 25 source activity types. No records were quarantined.

The layer makes no all-food-business, all-meat-business, unique-business, current-operation beyond the source-defined directory status, verified physical-site, public-access, current-hours, all-services, USPS-validity, generic-total, or nationwide-completeness claim. Counts are nonadditive across geography and activity dimensions. Names, addresses, coordinates, establishment identifiers, source record identifiers, telephone numbers, and raw records are excluded from the published aggregate artifacts and UI.

The NCUA, FDIC, FMCSA, SNAP, pharmacy, registry ZIP evidence-key delta, Census geography status, and broad-layer matrix retain their separate scopes. Broad organization coverage remains 11/51 jurisdictions admitted with 40 unresolved gaps. Independent retained-evidence review found that none of those 40 broad gaps can be closed from the currently retained authorized evidence. The four document-only inquiry proposals remain `PROPOSED`, `NOT APPROVED`, and `NO ACTION AUTHORIZED`.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 64 and every earlier CMS directory plan or approval are superseded. No source acquisition, network access, or production execution occurred while preparing this plan.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260924-65 --expected-plan-sha256 be444ea1807628464a24ae53783a956625d02755b173f9164d9a5e8c8e6f5b22
```
