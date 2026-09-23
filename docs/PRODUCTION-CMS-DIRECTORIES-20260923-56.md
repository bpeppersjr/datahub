# Proposed additive CMS directory production — September 23, 2026

Fresh governed planning completed after implementation commit `5c476bd`. That commit adds a protected, read-only Co*Tive management view for the exact four document-only inquiry proposals. The view independently verifies every proposal document hash, binds the 40 proposed jurisdictions to the verified current authorization-chain gap roster, derives coverage counts from that chain, fails closed on drift, and exposes no approval or execution control.

- Run ID: `production-cms-directories-20260923-56`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260923-56.json`
- Exact confirmation SHA-256: `449452913d238c6d60f47fcb1a900a0baa371e4c2803e64c900c73ae570bb5cb`
- Planning implementation commit: `5c476bd`

The retained-only plan includes the governed production source roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. The CMS rows remain local-review-only publisher directory records, not verified unique businesses, physical sites, or current operations.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has zero source-acquisition or network stages. No USPS dependency is selected.

Read-only exact-plan preflight returned `READY`; all current pins and retained inputs were reconstructed and verified, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 239,186,800,640 bytes and the current-output rebuild floor was 13,309,329,011 bytes.

The final repository suite passed 2,589 tests: 2,520 passed, 69 intentionally skipped, zero failed, and zero cancelled. The focused proposal-registry service, HTTP, UI, compatibility, drift, and security set passed 14/14. Lint, production web and desktop builds, independent code/security review, runtime restoration, health, and single-listener checks passed.

The proposal registry verifies these exact unapproved documents:

- Wave 1 SHA-256 `895aecf8e1220d3772972a5e5c843bcd46a4887068df28f966268b60d2ec109b`
- Wave 2 SHA-256 `7af64202446dec8e328a3955cd572b6dacd94863e6797dbbe1ee4498731701dc`
- Wave 3 SHA-256 `7309b02db317db8667f2c9cc146f002a7d1f8935e6b1db18bab339f824e9dc18`
- Wave 4 SHA-256 `b18ceb51b2c2aadf912587b12ea121a6ab1c4180c4a49db0478946a4b652a9f6`

All four remain `PROPOSED`, `NOT APPROVED`, and `NO ACTION AUTHORIZED`. Wave 1 supersedes only its prior unapproved document SHA. The view offers copy/view approval syntax only and grants no contact, browsing, data download, payment, enrollment, automation, connector, production, publication, or pointer authority.

Immutable matrix release `national-goal-completion-20260923152841-e96af677`, manifest SHA-256 `07c37108efff3d97e8d7b95920740e497c7acf7a68690c6f2573ae43e1c51273`, report SHA-256 `d6488ec20d5c16eb768090530db7243bb645bbb19e000ae8e8e4924750a7d478`, remains the actual broad-layer evidence view: 11/51 jurisdictions admitted and 40 unresolved data gaps. The registry reports 40/40 proposal coverage and 40/40 packet coverage separately; neither is collected-data coverage.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 55 and every earlier CMS directory plan or approval are superseded. No production execution occurred while preparing this plan.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260923-56 --expected-plan-sha256 449452913d238c6d60f47fcb1a900a0baa371e4c2803e64c900c73ae570bb5cb
```
