# Proposed additive CMS directory production — September 23, 2026

> **Superseded without execution.** Implementation commit `aca500b` published the separate governed national pharmacy-industry coverage layer after this plan was prepared, invalidating this plan's code fingerprint. Run `production-cms-directories-20260923-59` was never approved or executed and must not be used. It is replaced by `production-cms-directories-20260923-60` and the exact confirmation SHA recorded in `docs/PRODUCTION-CMS-DIRECTORIES-20260923-60.md`.

Fresh governed planning completed after implementation commit `702e00c3fec80d1a0f2c6d199cdb0d30db16ece1`. That commit adds an immutable, pointer-free registry ZIP evidence-key delta review and a protected read-only Co*Tive management view. The review holds and rechecks both registry generations' pointer, manifest, and ZIP-artifact identities across replay and does not treat source-reported ZIP5 values as operational USPS assignments.

- Run ID: `production-cms-directories-20260923-59`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260923-59.json`
- Exact confirmation SHA-256: `e0adc637c47507d2b3c4f46a41488f011a8fa76fb199999496ec6c8f29d2267d`
- Planning implementation commit: `702e00c3fec80d1a0f2c6d199cdb0d30db16ece1`

The retained-only plan includes the governed production source roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. The CMS rows remain local-review-only publisher directory records, not verified unique businesses, physical sites, or current operations.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has zero source-acquisition or network stages. No USPS dependency is selected.

Read-only exact-plan preflight returned `READY`; all current pins and retained inputs were reconstructed and verified, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 238,916,808,704 bytes and the current-output rebuild floor was 13,309,329,011 bytes.

The final repository suite passed 2,619 tests: 2,550 passed, 69 intentionally skipped, zero failed, and zero cancelled. Focused and live security checks passed 20/20. Lint, production web and desktop builds, exact retained replay, independent code/security review, runtime restoration, health, and single-listener checks passed.

Immutable release `zip-denominator-delta-review-20260923223658573-e72836b8`, manifest SHA-256 `75c33020e1c9ad6fe33534cfd2e1789fadf25d5baeacccb35a53eca653b24316`, artifact SHA-256 `e72836b8d4457a06bafba36fcf5905570a871d21bc301742acd5fc5998dd59b9`, compares 48,194 current registry ZIP evidence keys with 48,190 prior-candidate keys. It finds four additions and zero removals: three source-reported by Massachusetts childcare and one by Ohio childcare. All four have no same-code governed 2020 Census ZCTA, are not placeholders, and remain USPS-unverified. This is not evidence of USPS invalidity or deliverability, creates no ZIP geometry or inferred state, keeps ZIP5 and ZIP+4 separate, and grants no admission authority.

The reported-organization ZIP evidence release remains non-additive to business/site totals. Census ZCTA completeness, registry ZIP evidence, and operational USPS assignment status remain separate governed claims. The broad-layer matrix remains 11/51 jurisdictions admitted with 40 unresolved data gaps.

The four document-only inquiry proposals remain `PROPOSED`, `NOT APPROVED`, and `NO ACTION AUTHORIZED`. Proposal and packet coverage is not collected-data coverage.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 58 and every earlier CMS directory plan or approval are superseded. No production execution occurred while preparing this plan.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260923-59 --expected-plan-sha256 e0adc637c47507d2b3c4f46a41488f011a8fa76fb199999496ec6c8f29d2267d
```
