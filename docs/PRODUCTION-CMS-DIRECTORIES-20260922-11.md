# Proposed additive CMS directory production — September 22, 2026

Fresh governed planning completed after generic retained-release refresh readiness for Colorado, Connecticut, Delaware, Florida, and Pennsylvania was integrated, regression-tested, and runtime-restored. Execution was not dispatched.

- Run ID: `production-cms-directories-20260922-11`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260922-11.json`
- Exact confirmation SHA-256: `7082a6072808d8ab0235c5ec999320849732f679445acb4a86da7c8679fce65c`

The retained-only plan includes the governed production source roster, baseline/geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows and 14,690 CMS nursing-home directory rows. Those CMS rows remain local-review-only publisher records, not verified unique businesses, physical sites, or current operations.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has no source-acquisition or network stages. The new state readiness previews do not authorize refreshes: starts remain blocked before operation allocation.

Read-only exact-plan revalidation returned `READY`: all current pins were reconstructed, both retained CMS inputs were confirmed, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 252,024,385,536 bytes and the current-output rebuild floor was 13,309,329,011 bytes. These are point-in-time prerequisites, not reservations or peak-use guarantees.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. All earlier CMS directory plans and approvals are superseded.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260922-11 --expected-plan-sha256 7082a6072808d8ab0235c5ec999320849732f679445acb4a86da7c8679fce65c
```
