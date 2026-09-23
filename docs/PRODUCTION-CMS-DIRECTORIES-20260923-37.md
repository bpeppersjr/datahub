# Proposed additive CMS directory production — September 23, 2026

Fresh governed planning completed after Co*Tive added the immutable broad-organization acquisition backlog. Release `broad-organization-acquisition-backlog-2026-09-22-a485cf7845ff` contains the exact 43 jurisdictions without production-ready broad layers and preserves their validated assessment evidence and authorization flags. Its first ten are AK, DC, IL, MS, AR, KY, HI, KS, NV, and UT. It records zero source actions, grants no acquisition authority, changes no pointer, and is not a source dataset or completeness claim.

- Run ID: `production-cms-directories-20260923-37`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260923-37.json`
- Exact confirmation SHA-256: `403849ce6a8ccee251d7f481e9ad6858d14e2619761a2c0faaceafe4b63dcbe3`

The retained-only plan includes the governed production source roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. Those CMS directory rows remain local-review-only publisher records, not verified unique businesses, physical sites, or current operations. The acquisition backlog is not a production input.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has no source-acquisition or network stages. No USPS operational ZIP selection is present because no authorized governed local release is selected; Census ZCTA polygons, source-reported ZIP5, and ZBP ZIP aggregates remain separate evidence classes.

Read-only exact-plan revalidation returned `READY`: all current pins were reconstructed, both retained CMS directory inputs were confirmed, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 241,670,471,680 bytes and the current-output rebuild floor was 13,309,329,011 bytes. These are point-in-time prerequisites, not reservations or peak-use guarantees.

The complete repository check passed: 2,501 tests, 2,432 passed, 69 intentionally skipped, zero failed, and zero cancelled. Lint, the production web build, desktop build, desktop control-plane smoke, focused TypeScript checking, and the state-source assessment catalog check passed. The required stop script released the prior instance before testing, and the normal launcher restored a healthy service with exactly one listener on port 4300. `npm audit --omit=dev` reported zero vulnerabilities.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. All earlier CMS directory plans and approvals are superseded.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260923-37 --expected-plan-sha256 403849ce6a8ccee251d7f481e9ad6858d14e2619761a2c0faaceafe4b63dcbe3
```
