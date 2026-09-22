# Proposed additive CMS directory production — September 22, 2026

> Superseded by `production-cms-directories-20260922-23`; do not execute this plan.

Fresh governed planning completed after Datahub gained an isolated, read-only USPS City State candidate preview. The preview replays the exact licensed admission, source bytes, status mapping, and candidate publication; exposes bounded candidate membership with temporal provenance; and performs no writes or network requests. It does not alter the national registry builder, write a current pointer, assert postal operation or nationwide completeness, or add ZCTA geometry. The USPS candidate and preview are not inputs to this production plan. Collector stop/restart restoration passed with one healthy listener. Execution was not dispatched.

- Run ID: `production-cms-directories-20260922-22`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260922-22.json`
- Exact confirmation SHA-256: `22e83e696938f64b3c7efe2a2f27f8b106be56d48b1f8d243a1c6114da21af87`

The retained-only plan includes the governed production source roster, baseline/geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. Those CMS directory rows remain local-review-only publisher records, not verified unique businesses, physical sites, or current operations. The pharmacy projection, Overture Places, USPS City State candidate, and USPS preview are not inputs to this plan.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has no source-acquisition or network stages. No USPS operational ZIP selection is present because no authorized governed local release is selected; Census ZCTA polygons, source-reported ZIP5, and ZBP ZIP aggregates remain separate evidence classes.

Read-only exact-plan revalidation returned `READY`: all current pins were reconstructed, both retained CMS directory inputs were confirmed, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 248,917,110,784 bytes and the current-output rebuild floor was 13,309,329,011 bytes. These are point-in-time prerequisites, not reservations or peak-use guarantees.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. All earlier CMS directory plans and approvals are superseded.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260922-22 --expected-plan-sha256 22e83e696938f64b3c7efe2a2f27f8b106be56d48b1f8d243a1c6114da21af87
```
