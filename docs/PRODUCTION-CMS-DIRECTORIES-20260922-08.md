# Proposed additive CMS directory production — September 22, 2026

> Superseded without execution by `production-cms-directories-20260922-09` after the state cohort evidence and assessment-applicability integrations changed repository pins. Do not approve or execute this plan.

Fresh governed planning completed after retained IRS state-aggregate reporting and Oregon/New York held refresh-readiness services were integrated, tested, and runtime-restored. Execution was not dispatched.

- Run ID: `production-cms-directories-20260922-08`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260922-08.json`
- Exact confirmation SHA-256: `9042f3047c538d0d1f53dd14b763c44ec66449cae27f8472ec7c6e8c4fc29d14`

The retained-only plan includes the governed production source roster, baseline/geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows and 14,690 CMS nursing-home directory rows. Those CMS rows remain local-review-only publisher records, not verified unique businesses, physical sites, or current operations.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has no source-acquisition or network stages and does not refresh Iowa, Oregon, or New York; activate ten-source enrollment; admit USPS City State data; authorize public exports; geocode CMS rows; or convert directory rows into business counts.

Read-only exact-plan revalidation returned `READY`: all current pins were reconstructed, both retained CMS inputs were confirmed, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 252,125,995,008 bytes and the current-output rebuild floor was 13,309,329,011 bytes. These are point-in-time prerequisites, not reservations or peak-use guarantees.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. All earlier CMS directory plans and approvals are superseded.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260922-08 --expected-plan-sha256 9042f3047c538d0d1f53dd14b763c44ec66449cae27f8472ec7c6e8c4fc29d14
```
