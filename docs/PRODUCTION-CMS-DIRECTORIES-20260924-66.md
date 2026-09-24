# Proposed additive CMS directory production — September 24, 2026

> Superseded by Plan 67 (`production-cms-directories-20260924-67`, SHA-256 `b1a16e64a91b1da635273b2836f8ced72ca12f0079f92bee82f40f26a5d73b64`). Plan 66 is retained only as immutable planning history and is not approved for execution.

Fresh governed planning completed after implementation commit `9bce105c119b09092d6a494250be93715fd71f28`. That commit publishes a separate national EPA ECHO active-program-facility aggregate coverage dataset derived entirely from the retained, verified EPA ECHO release and pinned Census ZIP/ZCTA geography. It adds non-additive management and exact-ZIP visibility but does not change the generic business registry, entity resolution, category totals, exports, site totals, or completeness measures.

- Run ID: `production-cms-directories-20260924-66`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260924-66.json`
- Exact confirmation SHA-256: `1b404088f223f66765eb0f52fdb153c6790ba6b870191a497ee0c1d30f0fa154`
- Planning implementation commit: `9bce105c119b09092d6a494250be93715fd71f28`

The retained-only plan includes the governed 25-source production roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. The CMS rows remain local-review-only publisher directory records, not verified unique businesses, physical sites, or current operations.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has zero source-acquisition or network stages. No USPS dependency is selected.

Read-only exact-plan preflight returned `READY`; all current pins and retained inputs were reconstructed and verified, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 242,572,574,720 bytes and the current-output rebuild floor was 13,309,329,011 bytes.

The final repository suite passed 2,765 tests: 2,696 passed, 69 intentionally skipped, zero failed, zero cancelled, and zero todo. Lint passed with zero errors and four unrelated pre-existing warnings. Production web and desktop builds passed, the desktop control-plane smoke passed, and `npm audit --omit=dev` reported zero vulnerabilities. The required stop-and-launch recovery test returned healthy with exactly one loopback port 4300 listener.

Current derived release `national-epa-echo-active-facility-coverage-ddf773ab24a2942d` is selected by pointer SHA-256 `3dfa38f05f1e79f528381d100bfea5edcfd97ca24c51c97dd7ab1a85a5b7e6ee` and manifest SHA-256 `8746387114218de2a8b5c2917dadc548f28adc3f637974a9da4d007c4adf2f9a`. Its immutable aggregate artifacts contain one national summary, 56 jurisdiction rows, and 41,584 ZIP5-union rows.

The EPA ECHO layer starts from 3,175,741 source rows. The source marks 1,659,426 rows active and leaves 1,516,315 blank or unknown for the active flag; the latter are excluded. The governed layer accepts 1,517,826 source-defined active program-facility records and quarantines 141,600 active or unexpected records. It preserves 38,401 positive ZIP5 rows, 3,183 denominator-only ZIP-union rows, 1,490,289 record-level ZCTA matches, 27,537 nonpolygon records, 6,594 positive source ZIPs without ZCTA membership, and 5,668 positive source ZIPs without published ZIP Business Patterns. All 51 state/District jurisdictions have positive evidence; territory counts are AS 82, GU 534, MP 164, PR 3,524, and VI 551.

Program associations are nonexclusive and therefore nonadditive: Air 194,344, NPDES 502,585, RCRA 892,305, Safe Drinking Water 50,438, Toxics Release Inventory 21,415, and Greenhouse Gas Reporting 5,409. The source retains coordinates for all 1,517,826 accepted records, with 67,404 centroid warnings and 5,154 missing accuracy values, but coordinates are excluded from the published aggregate artifacts and UI. No ZIP+4 values are reported.

The layer makes no all-business, unique-business, all-environmentally-regulated-facility, current-operation beyond source status, verified physical-site, public-access, current-hours, usable-premise-geocode, USPS-validity, generic-total, or nationwide-completeness claim. Names, addresses, coordinates, geometry, FRS and program identifiers, record identifiers, report URLs, raw records, and quarantine records are excluded from the published aggregate artifacts and UI.

The FSIS, NCUA, FDIC, FMCSA, SNAP, pharmacy, registry ZIP evidence-key delta, Census geography status, and broad-layer matrix retain their separate scopes. Broad organization coverage remains 11/51 jurisdictions admitted with 40 unresolved gaps. Independent retained-evidence review found that none of those 40 broad gaps can be closed from the currently retained authorized evidence. The four document-only inquiry proposals remain `PROPOSED`, `NOT APPROVED`, and `NO ACTION AUTHORIZED`.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 65 and every earlier CMS directory plan or approval are superseded. No source acquisition, network access, or production execution occurred while preparing this plan.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260924-66 --expected-plan-sha256 1b404088f223f66765eb0f52fdb153c6790ba6b870191a497ee0c1d30f0fa154
```
