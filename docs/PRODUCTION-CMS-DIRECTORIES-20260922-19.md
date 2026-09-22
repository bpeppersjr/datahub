# Proposed additive CMS directory production — September 22, 2026

> Superseded by `production-cms-directories-20260922-20` after retained-adoption provenance visibility and the 51-jurisdiction source-readiness record were aligned. Do not execute or approve this plan.

Fresh governed planning completed after the CMS NPPES community/retail-pharmacy heatmap gained real, bounded state and exact-code ZCTA geometry. The national view loads no ZCTA partitions; a selected state loads only its required prefix partitions. The map conserves 87,659 state/DC records, 1,415 territory records, and 3 unassigned records against the 89,077-record local pharmacy projection. It remains a separate, non-additive source view and is not an input to this production plan. Collector stop/restart restoration passed with one listener, a healthy application endpoint, and an unauthenticated pharmacy request correctly rejected. Execution was not dispatched.

- Run ID: `production-cms-directories-20260922-19`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260922-19.json`
- Exact confirmation SHA-256: `aa7551828dd1faf6ba94a2b72ec7c1d3fa77e93bc04e128c56391681ab462ead`

The retained-only plan includes the governed production source roster, baseline/geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. Those CMS directory rows remain local-review-only publisher records, not verified unique businesses, physical sites, or current operations. The pharmacy projection and Overture Places are not inputs to this plan.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has no source-acquisition or network stages. No USPS operational ZIP selection is present because no authorized governed local release currently exists; Census ZCTA polygons, source-reported ZIP5, and ZBP ZIP aggregates remain separate evidence classes.

Read-only exact-plan revalidation returned `READY`: all current pins were reconstructed, both retained CMS directory inputs were confirmed, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 251,774,246,912 bytes and the current-output rebuild floor was 13,309,329,011 bytes. These are point-in-time prerequisites, not reservations or peak-use guarantees.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. All earlier CMS directory plans and approvals are superseded.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260922-19 --expected-plan-sha256 aa7551828dd1faf6ba94a2b72ec7c1d3fa77e93bc04e128c56391681ab462ead
```
