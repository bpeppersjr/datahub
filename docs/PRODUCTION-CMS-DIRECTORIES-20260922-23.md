# Proposed additive CMS directory production — September 22, 2026

> Superseded by `production-cms-directories-20260922-24`; do not execute this plan.

Fresh governed planning completed after Co*Tive corrected industry-plan gap reporting to reflect the state sources that will actually run. Explicitly narrowed plans now retain gaps for configured-but-unselected state sources, while manual-only omissions remain distinct. The change affects planning truthfulness only; it downloaded no data and executed no production work. Collector stop/restart restoration passed with one healthy listener.

- Run ID: `production-cms-directories-20260922-23`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260922-23.json`
- Exact confirmation SHA-256: `f5ec235099327367ee9226de36d868f91cea9ce009d1a1b603ed964eb09db3d7`

The retained-only plan includes the governed production source roster, baseline/geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. Those CMS directory rows remain local-review-only publisher records, not verified unique businesses, physical sites, or current operations. The pharmacy projection, Overture Places, USPS City State candidate, and USPS preview are not inputs to this plan.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has no source-acquisition or network stages. No USPS operational ZIP selection is present because no authorized governed local release is selected; Census ZCTA polygons, source-reported ZIP5, and ZBP ZIP aggregates remain separate evidence classes.

Read-only exact-plan revalidation returned `READY`: all current pins were reconstructed, both retained CMS directory inputs were confirmed, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 248,909,004,800 bytes and the current-output rebuild floor was 13,309,329,011 bytes. These are point-in-time prerequisites, not reservations or peak-use guarantees.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. All earlier CMS directory plans and approvals are superseded.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260922-23 --expected-plan-sha256 f5ec235099327367ee9226de36d868f91cea9ce009d1a1b603ed964eb09db3d7
```
