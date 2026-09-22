# Proposed additive CMS directory production — September 22, 2026

Fresh governed planning completed after retained CMS hospital state/ZIP readiness, an authenticated retained Census ZBP ZIP-industry view, and a schema-4 state-access card were integrated and regression-tested. Collector stop/restart restoration passed with one listener and a healthy application endpoint. Execution was not dispatched.

- Run ID: `production-cms-directories-20260922-15`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260922-15.json`
- Exact confirmation SHA-256: `b261f28b0fb052c1a2026b3b1c546fd139651039c82e0d6f95eebbc2a5222308`

The retained-only plan includes the governed production source roster, baseline/geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows and 14,690 CMS nursing-home directory rows. Those CMS rows remain local-review-only publisher records, not verified unique businesses, physical sites, or current operations.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has no source-acquisition or network stages. No USPS operational ZIP selection is present because no authorized governed local release currently exists; Census ZCTA polygons, source-reported ZIP5, and ZBP ZIP aggregates remain separate evidence classes.

Read-only exact-plan revalidation returned `READY`: all current pins were reconstructed, both retained CMS inputs were confirmed, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 251,942,408,192 bytes and the current-output rebuild floor was 13,309,329,011 bytes. These are point-in-time prerequisites, not reservations or peak-use guarantees.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. All earlier CMS directory plans and approvals are superseded.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260922-15 --expected-plan-sha256 b261f28b0fb052c1a2026b3b1c546fd139651039c82e0d6f95eebbc2a5222308
```
