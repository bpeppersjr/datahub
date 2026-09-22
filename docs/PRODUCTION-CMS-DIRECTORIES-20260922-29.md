# Proposed additive CMS directory production — September 22, 2026

Superseded by `production-cms-directories-20260922-30` after the governed exact-ZIP evidence inspector implementation changed the repository state. Do not execute this plan.

Fresh governed planning completed after Co*Tive published a retained-only NPPES pharmacy secondary-address view. That view contains 420 provider-reported non-primary addresses linked by exact NPI to 332 pharmacy-classified organizations across 377 ZIP5 values. It is a separate reporting layer, not confirmed pharmacy-site or current-operation evidence, and it contributes zero additional business/site records to this plan. Collector stop/restart restoration passed with one healthy listener.

- Run ID: `production-cms-directories-20260922-29`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260922-29.json`
- Exact confirmation SHA-256: `dcdca267b51765b756f54b4f257876f92e1315b60bbbc4e7ce5c10087acf5708`

The retained-only plan includes the governed production source roster, baseline/geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. Those CMS directory rows remain local-review-only publisher records, not verified unique businesses, physical sites, or current operations. The pharmacy secondary-address view, Nebraska prerequisite, Overture Places, USPS City State candidate/preview, nursing chain assertion view, and county-industry heatmap are not additional registry inputs to this plan.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has no source-acquisition or network stages. No USPS operational ZIP selection is present because no authorized governed local release is selected; Census ZCTA polygons, source-reported ZIP5, and ZBP ZIP aggregates remain separate evidence classes.

Read-only exact-plan revalidation returned `READY`: all current pins were reconstructed, both retained CMS directory inputs were confirmed, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 248,745,480,192 bytes and the current-output rebuild floor was 13,309,329,011 bytes. These are point-in-time prerequisites, not reservations or peak-use guarantees.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. All earlier CMS directory plans and approvals are superseded.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260922-29 --expected-plan-sha256 dcdca267b51765b756f54b4f257876f92e1315b60bbbc4e7ce5c10087acf5708
```
