# Proposed additive CMS directory production — September 22, 2026

> Superseded by `production-cms-directories-20260922-18` after the governed retained NPPES community/retail-pharmacy subset was added and independently hardened. Do not execute or approve this plan.

Fresh governed planning completed after state-access temporal status was corrected so annual Census aggregate context cannot make unsupported named-business access appear current. The newly enrolled immutable 459-cell report preserves all access classifications and counts while 57 unsupported cells now report no positive access evidence; Census context retains its own independently bound temporal status. Collector stop/restart restoration passed with one listener and a healthy application endpoint. Execution was not dispatched.

- Run ID: `production-cms-directories-20260922-17`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260922-17.json`
- Exact confirmation SHA-256: `202473c7656f523b9c839e5245de8706a8ec81403e924d6ba9d42ab1932da67b`

The retained-only plan includes the governed production source roster, baseline/geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows and 14,690 CMS nursing-home directory rows. Those CMS rows remain local-review-only publisher records, not verified unique businesses, physical sites, or current operations. Overture Places is not an input to this plan.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has no source-acquisition or network stages. No USPS operational ZIP selection is present because no authorized governed local release currently exists; Census ZCTA polygons, source-reported ZIP5, and ZBP ZIP aggregates remain separate evidence classes.

Read-only exact-plan revalidation returned `READY`: all current pins were reconstructed, both retained CMS inputs were confirmed, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 251,885,821,952 bytes and the current-output rebuild floor was 13,309,329,011 bytes. These are point-in-time prerequisites, not reservations or peak-use guarantees.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. All earlier CMS directory plans and approvals are superseded.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260922-17 --expected-plan-sha256 202473c7656f523b9c839e5245de8706a8ec81403e924d6ba9d42ab1932da67b
```
