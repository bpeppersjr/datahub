# Proposed additive CMS directory production — September 23, 2026

Fresh governed planning completed after Co*Tive added the immutable broad-organization authorization packet and corrected stale completion-matrix documentation. Release `broad-organization-authorization-packet-2026-09-22-99e3b9c24e75` is derived from the verified 43-jurisdiction backlog and contains 74 non-row-bearing evidence specifications for the exact first wave: AK, DC, IL, MS, AR, KY, HI, KS, NV, and UT. Its manifest SHA-256 is `59d1a9cd556ed225f9665c4bb4491beb2513520ab147f942401f911474452418`; its artifact SHA-256 is `99e3b9c24e757bd3c97320f1819ae546ade6f1c022f99ce916bd2d6486cfd51f`. It records zero source actions, grants no contact, download, payment, record-request, acquisition, or production authority, changes no pointer, and is not a source dataset or completeness claim.

- Run ID: `production-cms-directories-20260923-38`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260923-38.json`
- Exact confirmation SHA-256: `b62ca165df6df0dec0d60ba4fbc314ede171917862ff9ede27063e6fc0ec8ebc`

The retained-only plan includes the governed production source roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. Those CMS directory rows remain local-review-only publisher records, not verified unique businesses, physical sites, or current operations. Neither the acquisition backlog nor the authorization packet is a production input.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has no source-acquisition or network stages. No USPS operational ZIP selection is present because no authorized governed local release is selected; Census ZCTA polygons, source-reported ZIP5, and ZBP ZIP aggregates remain separate evidence classes.

Read-only exact-plan revalidation returned `READY`: all current pins were reconstructed, both retained CMS directory inputs were confirmed, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 241,610,522,624 bytes and the current-output rebuild floor was 13,309,329,011 bytes. These are point-in-time prerequisites, not reservations or peak-use guarantees.

The complete repository check passed: 2,508 tests, 2,439 passed, 69 intentionally skipped, zero failed, and zero cancelled. Lint, the production web build, desktop build, desktop control-plane smoke, focused TypeScript checking, and packet verification passed. The required stop script released the prior instance before testing, and the normal launcher restored a healthy service with exactly one listener on port 4300. `npm audit --omit=dev` reported zero vulnerabilities.

The permanent coverage-workbook owner also published the independently audited snapshot `outputs/01a0ccb1-7e2d-7f83-984d-bc98afe27147/coverage-status/snapshots/cotive-collector-national-coverage-status-20260923T053504Z.xlsx`, SHA-256 `a2b7d90b57d272e825dc0abb4a2a0627d3be2bbb41437629ecc20b8cfbe56617`. It contains 27 governed dataset classes across all 51 state entities, nine formula-driven industry rollups, and immutable provenance. This workbook is status evidence only and is not a production input or approval.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. All earlier CMS directory plans and approvals are superseded.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260923-38 --expected-plan-sha256 b62ca165df6df0dec0d60ba4fbc314ede171917862ff9ede27063e6fc0ec8ebc
```
