# Proposed additive CMS directory production — September 23, 2026

> **Superseded without execution.** Implementation commit `d5e5cf1c3bed534c34c5f4e7a9ad905885d4886d` published the separate governed national FMCSA registrant principal-office coverage layer after this plan was prepared, invalidating this plan's code fingerprint. Run `production-cms-directories-20260923-61` was never approved or executed and must not be used. It is replaced by `production-cms-directories-20260923-62` and the exact confirmation SHA recorded in `docs/PRODUCTION-CMS-DIRECTORIES-20260923-62.md`.

Fresh governed planning completed after implementation commit `b87c0716d2cb3ca26f7e518faf3caae0bb342b9f`. That commit publishes a separate national SNAP-retailer industry coverage dataset derived entirely from the retained, verified USDA FNS SNAP retailer release and its pinned Census ZIP/ZCTA dependencies. It adds non-additive management and exact-ZIP visibility but does not change the generic business registry, entity resolution, category totals, exports, site totals, or completeness measures.

- Run ID: `production-cms-directories-20260923-61`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260923-61.json`
- Exact confirmation SHA-256: `fbec38b4353b46121d978dacdf5b2f8f6ece7f7df7ef91b1cd656afc0a76e799`
- Planning implementation commit: `b87c0716d2cb3ca26f7e518faf3caae0bb342b9f`

The retained-only plan includes the governed production source roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. The CMS rows remain local-review-only publisher directory records, not verified unique businesses, physical sites, or current operations.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has zero source-acquisition or network stages. No USPS dependency is selected.

Read-only exact-plan preflight returned `READY`; all current pins and retained inputs were reconstructed and verified, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 244,346,097,664 bytes and the current-output rebuild floor was 13,309,329,011 bytes.

The final repository suite passed 2,657 tests: 2,588 passed, 69 intentionally skipped, zero failed, zero cancelled, and zero todo. The focused SNAP/security suite passed 41 of 41 after independent adversarial review. Lint passed with zero errors, and TypeScript, production web, and desktop builds passed.

Current derived release `national-snap-retailer-industry-coverage-515f0b15bc44ec5f` is selected by pointer SHA-256 `6ef3974733ce5b0a7c872cfc1c54746dc83da36aaa283028ab94f249b35f55c6` and manifest SHA-256 `19b2019fc67dffc6176ad2a5638ae81fea92140a80c82aa06a4103a66707e428`. Its immutable artifacts contain one national summary, 53 reported-jurisdiction rows, and 37,872 ZIP5-union rows.

The SNAP layer counts 252,080 USDA SNAP-authorized retailer-location records at the pinned source update, including 251,752 state/DC records and 328 GU/VI territory records. It preserves 23,957 positive ZIP5 values, 13,915 ZIP-union rows with no retailer in the retained snapshot, 224,257 separately stored ZIP+4 values, 252,080 retained coordinate pairs, and the exact eight-category USDA store-type distribution. It makes no all-grocery, unique-business, current-operation, nationwide-completeness, ownership, parent-company, brand, NAICS, USPS-validity, or independently verified physical-site claim. It is excluded from generic business, entity, site, category, and export totals.

The pharmacy layer, registry ZIP evidence-key delta, Census geography status, and broad-layer matrix retain their separate scopes. Broad organization coverage remains 11/51 jurisdictions admitted with 40 unresolved gaps. Independent retained-evidence review found that none of those 40 broad gaps can be closed from the currently retained authorized evidence. The four document-only inquiry proposals remain `PROPOSED`, `NOT APPROVED`, and `NO ACTION AUTHORIZED`.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 60 and every earlier CMS directory plan or approval are superseded. No production execution occurred while preparing this plan.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260923-61 --expected-plan-sha256 fbec38b4353b46121d978dacdf5b2f8f6ece7f7df7ef91b1cd656afc0a76e799
```
