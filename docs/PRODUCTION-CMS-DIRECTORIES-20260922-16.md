# Proposed additive CMS directory production — September 22, 2026

Fresh governed planning completed after the metadata-only Overture Places readiness view was integrated and regression-tested. The view admits zero Overture names, categories, state assignments, ZIP5 rows, or geocodes and exposes no acquisition or retry control. Collector stop/restart restoration passed with one listener and a healthy application endpoint. Execution was not dispatched.

- Run ID: `production-cms-directories-20260922-16`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260922-16.json`
- Exact confirmation SHA-256: `c816123627dc834e1e6e66684db10e9ba6457ea9ad61fc9cac11adf9f50a6b9a`

The retained-only plan includes the governed production source roster, baseline/geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows and 14,690 CMS nursing-home directory rows. Those CMS rows remain local-review-only publisher records, not verified unique businesses, physical sites, or current operations. Overture Places is not an input to this plan.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has no source-acquisition or network stages. No USPS operational ZIP selection is present because no authorized governed local release currently exists; Census ZCTA polygons, source-reported ZIP5, and ZBP ZIP aggregates remain separate evidence classes.

Read-only exact-plan revalidation returned `READY`: all current pins were reconstructed, both retained CMS inputs were confirmed, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 251,929,055,232 bytes and the current-output rebuild floor was 13,309,329,011 bytes. These are point-in-time prerequisites, not reservations or peak-use guarantees.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. All earlier CMS directory plans and approvals are superseded.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260922-16 --expected-plan-sha256 c816123627dc834e1e6e66684db10e9ba6457ea9ad61fc9cac11adf9f50a6b9a
```
