# Proposed additive CMS directory production — September 22, 2026

Superseded by `production-cms-directories-20260922-14` after staged-refresh cancellation hardening, gated USPS production-input support, and retained nursing-directory readiness changed the reviewed code pins. Do not approve or execute this plan.

Fresh governed planning completed after ten fail-closed state-refresh bindings, nationwide childcare/construction Census aggregate context, and mandatory state-evidence temporal bindings were integrated and regression-tested. Collector stop/restart restoration passed with one listener and a healthy application endpoint. Execution was not dispatched.

- Run ID: `production-cms-directories-20260922-13`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260922-13.json`
- Exact confirmation SHA-256: `000ec5accb6836bf334c08cd9d7fc7a15d83009890efca80b5a4636bae078c76`

The retained-only plan includes the governed production source roster, baseline/geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows and 14,690 CMS nursing-home directory rows. Those CMS rows remain local-review-only publisher records, not verified unique businesses, physical sites, or current operations.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has no source-acquisition or network stages. All ten managed source-refresh bindings remain on `HOLD`; starts are rejected before operation allocation.

Read-only exact-plan revalidation returned `READY`: all current pins were reconstructed, both retained CMS inputs were confirmed, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 252,005,261,312 bytes and the current-output rebuild floor was 13,309,329,011 bytes. These are point-in-time prerequisites, not reservations or peak-use guarantees.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. All earlier CMS directory plans and approvals are superseded.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260922-13 --expected-plan-sha256 000ec5accb6836bf334c08cd9d7fc7a15d83009890efca80b5a4636bae078c76
```
