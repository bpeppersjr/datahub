# Proposed additive CMS directory production — September 22, 2026

> Superseded by `production-cms-directories-20260922-19` after the governed pharmacy geographic heatmap and bounded geometry-loading changes were promoted. Do not execute or approve this plan.

Fresh governed planning completed after a local-only CMS NPPES community/retail-pharmacy subset was built, independently audited, hardened, and exposed through an authenticated Heatmap mode. The subset contains 89,077 unique organization NPI rows carrying taxonomy `3336C0003X`; 90,074 is retained separately as taxonomy-slot occurrences and is not called a record count. The subset does not increment generic NPPES, health-care, or all-business totals and is not an input to this production plan. Collector stop/restart restoration passed with one listener and a healthy application endpoint. Execution was not dispatched.

- Run ID: `production-cms-directories-20260922-18`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260922-18.json`
- Exact confirmation SHA-256: `1e7a8a30993402ad89f51f053d1a097e6bbcd108c2b2eb7e9c34db10fac27780`

The retained-only plan includes the governed production source roster, baseline/geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows and 14,690 CMS nursing-home directory rows. Those CMS directory rows remain local-review-only publisher records, not verified unique businesses, physical sites, or current operations. The new pharmacy projection and Overture Places are not inputs to this plan.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has no source-acquisition or network stages. No USPS operational ZIP selection is present because no authorized governed local release currently exists; Census ZCTA polygons, source-reported ZIP5, and ZBP ZIP aggregates remain separate evidence classes.

Read-only exact-plan revalidation returned `READY`: all current pins were reconstructed, both retained CMS directory inputs were confirmed, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 251,810,865,152 bytes and the current-output rebuild floor was 13,309,329,011 bytes. These are point-in-time prerequisites, not reservations or peak-use guarantees.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. All earlier CMS directory plans and approvals are superseded.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260922-18 --expected-plan-sha256 1e7a8a30993402ad89f51f053d1a097e6bbcd108c2b2eb7e9c34db10fac27780
```
