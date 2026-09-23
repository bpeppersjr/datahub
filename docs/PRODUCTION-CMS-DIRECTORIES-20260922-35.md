# Proposed additive CMS directory production — September 22, 2026

> Superseded by `production-cms-directories-20260922-36` after the goal-completion matrix schema and UI began distinguishing unmeasured cells from measured zero. Do not execute this plan.

Fresh governed planning completed after Co*Tive corrected the national goal-completion matrix's geocode completion arithmetic. Dataset-presence percentages remain one-decimal measures, while geocode completion now uses exact integer counts and twelve-decimal half-up rounding. Incomplete cohorts cannot be serialized as 100%. The governed matrix release `national-goal-completion-20260923032141-ad887b33` reports FDIC at 99.983179142136% (77,272 of 77,285) and SNAP at 99.993652808632% (252,064 of 252,080). This status-only change does not alter registry, map, business, site, or source counts.

- Run ID: `production-cms-directories-20260922-35`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260922-35.json`
- Exact confirmation SHA-256: `a77cc3a53385de430e44dca364e1d1383f2c71efd16875bed4d912b7696484d5`

The retained-only plan includes the governed production source roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. Those CMS directory rows remain local-review-only publisher records, not verified unique businesses, physical sites, or current operations. The chain-assertion consumer does not change registry, map, business, site, or completeness totals and is not an additional registry input.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has no source-acquisition or network stages. No USPS operational ZIP selection is present because no authorized governed local release is selected; Census ZCTA polygons, source-reported ZIP5, and ZBP ZIP aggregates remain separate evidence classes.

Read-only exact-plan revalidation returned `READY`: all current pins were reconstructed, both retained CMS directory inputs were confirmed, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 241,597,366,272 bytes and the current-output rebuild floor was 13,309,329,011 bytes. These are point-in-time prerequisites, not reservations or peak-use guarantees.

The complete repository check passed after the precision correction: 2,490 tests, 2,421 passed, 69 intentionally skipped, zero failed, and zero cancelled. Lint, the production web build, desktop build, and desktop control-plane smoke passed. Focused TypeScript checking also passed. The required stop script released the prior instance before testing, and the normal launcher restored a healthy service with exactly one listener on port 4300. `npm audit --omit=dev` reported zero vulnerabilities.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. All earlier CMS directory plans and approvals are superseded.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260922-35 --expected-plan-sha256 a77cc3a53385de430e44dca364e1d1383f2c71efd16875bed4d912b7696484d5
```
