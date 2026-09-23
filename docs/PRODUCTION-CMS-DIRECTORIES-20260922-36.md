# Proposed additive CMS directory production — September 22, 2026

Fresh governed planning completed after Co*Tive versioned the national goal-completion matrix as `national-goal-completion-matrix@1.1.0`. Category cells now report measured and unmeasured denominator members separately, calculate availability only among measured members, and retain null percentage when no member is measured. Observed zero remains measured evidence at 0%. Historical `@1.0.0` releases remain independently verifiable and are normalized by the read-only view. The new immutable release is `national-goal-completion-20260923040507-ab8f34fc`, report SHA-256 `11162dc115b9019eee29b3e841594ee009ff16c127aafbab7a4196ea0876ae23`. This status-only change does not alter registry, map, business, site, or source counts.

- Run ID: `production-cms-directories-20260922-36`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260922-36.json`
- Exact confirmation SHA-256: `8b36d1fe20f629db1fff95dc7939bd016af53a29aa0f56a14f0460bdb6c74c7f`

The retained-only plan includes the governed production source roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. Those CMS directory rows remain local-review-only publisher records, not verified unique businesses, physical sites, or current operations.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has no source-acquisition or network stages. No USPS operational ZIP selection is present because no authorized governed local release is selected; Census ZCTA polygons, source-reported ZIP5, and ZBP ZIP aggregates remain separate evidence classes.

Read-only exact-plan revalidation returned `READY`: all current pins were reconstructed, both retained CMS directory inputs were confirmed, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 241,586,429,952 bytes and the current-output rebuild floor was 13,309,329,011 bytes. These are point-in-time prerequisites, not reservations or peak-use guarantees.

The complete repository check passed: 2,491 tests, 2,422 passed, 69 intentionally skipped, zero failed, and zero cancelled. Lint, the production web build, desktop build, and desktop control-plane smoke passed. Focused TypeScript checking also passed. The required stop script released the prior instance before testing, and the normal launcher restored a healthy service with exactly one listener on port 4300. `npm audit --omit=dev` reported zero vulnerabilities.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. All earlier CMS directory plans and approvals are superseded.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260922-36 --expected-plan-sha256 8b36d1fe20f629db1fff95dc7939bd016af53a29aa0f56a14f0460bdb6c74c7f
```
