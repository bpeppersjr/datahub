# Proposed additive CMS directory production — September 23, 2026

> **Superseded without execution.** Implementation commit `241dd6d140ce158afcf6c9f1ca13038fdc5fce83` published the separate governed national FDIC BankFind coverage layer after this plan was prepared, invalidating this plan's code fingerprint. Run `production-cms-directories-20260923-62` was never approved or executed and must not be used. It is replaced by `production-cms-directories-20260923-63` and the exact confirmation SHA recorded in `docs/PRODUCTION-CMS-DIRECTORIES-20260923-63.md`.

Fresh governed planning completed after implementation commit `d5e5cf1c3bed534c34c5f4e7a9ad905885d4886d`. That commit publishes a separate national FMCSA source-active registrant principal-office coverage dataset derived entirely from the retained, verified FMCSA Company Census release and its pinned Census ZIP/ZCTA dependencies. It adds non-additive management and exact-ZIP visibility but does not change the generic business registry, entity resolution, category totals, exports, site totals, or completeness measures.

- Run ID: `production-cms-directories-20260923-62`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260923-62.json`
- Exact confirmation SHA-256: `1a9fd5b3f864d6691a239807e8543e9c2c22f01f36424eefd350e4a87df83799`
- Planning implementation commit: `d5e5cf1c3bed534c34c5f4e7a9ad905885d4886d`

The retained-only plan includes the governed production source roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. The CMS rows remain local-review-only publisher directory records, not verified unique businesses, physical sites, or current operations.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has zero source-acquisition or network stages. No USPS dependency is selected.

Read-only exact-plan preflight returned `READY`; all current pins and retained inputs were reconstructed and verified, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 243,931,209,728 bytes and the current-output rebuild floor was 13,309,329,011 bytes.

The final repository suite passed 2,680 tests: 2,611 passed, 69 intentionally skipped, zero failed, zero cancelled, and zero todo. The focused FMCSA/security suite passed 45 of 45 after independent adversarial review. Lint passed with zero errors, and TypeScript, production web, and desktop builds passed.

Current derived release `national-fmcsa-registrant-principal-office-coverage-0cac1512bd3c5f30` is selected by pointer SHA-256 `6f071bb44b2c52965db5353d6e9dc98b3c94befb3282f2aba185559b90532267` and manifest SHA-256 `136638f9a93dc64c3fdcebef367c84359e743e5524c27c0b27e49b474aa01945`. Its immutable artifacts contain one national summary, 56 reported-jurisdiction rows, and 39,151 ZIP5-union rows.

The FMCSA layer counts 2,195,563 accepted source-active registration principal-office records from 2,211,982 selected source rows, with 16,419 quarantined rows disclosed separately. It preserves 2,189,579 state/DC records, 5,984 territory records, 35,648 positive ZIP5 values, 3,503 ZIP-union rows with no accepted record in the retained snapshot, 550,920 separately stored ZIP+4 values, zero admitted coordinates, and the exact source-specific carrier-operation, entity-role, hazmat, and governed-class dimensions. Unbounded `OTHER-*` source text is collapsed into a non-identifying governed `OTHER` bucket.

The layer makes no all-business, all-transportation, unique-company, legal-organization, current-operation, storefront, customer-accessible-site, vehicle-base, parent-company, ownership, USPS-validity, real-time, or nationwide-completeness claim. Principal offices may be homes. It is excluded from generic business, entity, site, category, and export totals. The aggregate artifacts and UI contain no names, addresses, USDOT/docket identifiers, or source free text.

The SNAP, pharmacy, registry ZIP evidence-key delta, Census geography status, and broad-layer matrix retain their separate scopes. Broad organization coverage remains 11/51 jurisdictions admitted with 40 unresolved gaps. Independent retained-evidence review found that none of those 40 broad gaps can be closed from the currently retained authorized evidence. The four document-only inquiry proposals remain `PROPOSED`, `NOT APPROVED`, and `NO ACTION AUTHORIZED`.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 61 and every earlier CMS directory plan or approval are superseded. No production execution occurred while preparing this plan.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260923-62 --expected-plan-sha256 1a9fd5b3f864d6691a239807e8543e9c2c22f01f36424eefd350e4a87df83799
```
