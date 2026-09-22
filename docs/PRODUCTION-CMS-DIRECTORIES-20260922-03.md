# Proposed additive CMS directory production — September 22, 2026

Fresh governed planning completed after the national completion matrix, offline USPS City State admission boundary, connector inventory update and temporal-conservation audit were integrated. Execution was not dispatched.

- Run ID: `production-cms-directories-20260922-03`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260922-03.json`
- Exact confirmation SHA-256: `cd283c4c4a01292e0918e6daaee323743438424a9aec8d5ecfdb4f098721463f`

The plan uses retained evidence only. It pins the governed production source roster and baseline/geographic inputs, the existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows and 14,690 CMS nursing-home directory rows. CMS directory rows remain local-review-only publisher records, not verified unique businesses, physical sites or current operations.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark and coverage releases. Publication is not atomic across those datasets. This plan does not acquire sources, activate ten-source enrollment, authorize public record export, geocode CMS rows or admit a USPS City State artifact.

Read-only exact-plan revalidation returned `READY`: every current pin was reconstructed, both retained CMS inputs were confirmed, source-acquisition and network stage counts were zero, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 252,267,884,544 bytes and the current-output rebuild floor was 13,309,329,011 bytes. These are point-in-time prerequisites, not reservations or peak-use guarantees.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. All earlier CMS directory plans and approvals are superseded and do not authorize this run.

Immediately before any approved execution, repeat the non-writing preflight:

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260922-03 --expected-plan-sha256 cd283c4c4a01292e0918e6daaee323743438424a9aec8d5ecfdb4f098721463f
```
