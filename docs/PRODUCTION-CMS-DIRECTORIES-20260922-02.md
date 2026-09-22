# Proposed additive CMS directory production — September 22, 2026

Fresh governed planning completed after the Minnesota/Ohio state-evidence projection and USPS ZIP-validity gap contract were integrated. Execution was not dispatched.

- Run ID: `production-cms-directories-20260922-02`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260922-02.json`
- Exact confirmation SHA-256: `186e03faee99285065da6c7f3aaf801d470cf06da371bd698e1132e0510cb4fe`

The plan pins 25 production sources, four national baseline/geographic inputs, four explicit MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, CMS hospital evidence and CMS nursing-home evidence. The additive CMS inputs remain 5,419 hospital directory rows and 14,690 nursing-home directory rows. They are retained publisher directory records with local-review-only policy, not verified unique businesses, physical sites or current operations. No source was downloaded, refreshed or queried while creating this plan.

If separately approved and executed, eight sequential stages would build and verify new registry, entity-resolution, benchmark and coverage releases. Publication is not atomic across the four datasets. The run would not activate ten-source enrollment, authorize public export, geocode CMS rows or convert directory-row counts into business counts.

Read-only exact-plan revalidation returned `READY`: every current pin was reconstructed, both retained CMS inputs were confirmed, source-acquisition and network stage counts were zero, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 252,331,634,688 bytes and the current-output rebuild floor was 13,309,329,011 bytes; this is a point-in-time preflight, not a reservation or peak-use guarantee.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. The stale September 12 proposal, the superseded `production-cms-directories-20260922-01` plan and historical approvals do not authorize this run.

Immediately before any approved execution, repeat the non-writing preflight:

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260922-02 --expected-plan-sha256 186e03faee99285065da6c7f3aaf801d470cf06da371bd698e1132e0510cb4fe
```
