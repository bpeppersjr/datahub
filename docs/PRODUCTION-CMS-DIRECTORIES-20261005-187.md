# Proposed retained-data production reconciliation — October 5, 2026

Plan 187 is a planning-only successor to Plan 186 after Co*Tive added an explicit governed Industry Status section in commit `acffa58d923fa1e69c923900a7e1d9c6c8aa615f`. The view separates nine operational maintenance segments from 39 governed source dimensions, reports selected maintenance intent, retained jurisdiction/source-access evidence, temporal review status, source release/vintage provenance, and preserves unavailable or unknown evidence without converting it to zero. It does not claim all-business completeness, business counts, authorization, or verified current operation. The same change restored the ZIP GDP reader's compatibility with the current provenance-bound temporal qualification view and repaired two stale UI test harness expectations. This document does not approve or execute production reconciliation.

- Run ID: `production-cms-directories-20261005-187`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261005-187.json`
- Plan confirmation SHA-256: `df55ca5979d40a9e3e4e931d65854e7a25e0d8c7c0de324ca2d97f3245c75a29`
- Plan file SHA-256: `4819c40dcc2a3d3d25e7d381b98ec93414fd7864ba38fe0ba80f984da792db80`
- Plan 186 predecessor confirmation SHA-256: `86a5f87cf3a003044c20f5d8b1bac5ecb5cb95e838a9cd06782a5f5daa1dd145`
- Plan 186 predecessor file SHA-256: `c0300958f77ac4976b23bd098ade17c37fb3d6b640700086739733a289dc05a7`
- Implementation commit: `acffa58d923fa1e69c923900a7e1d9c6c8aa615f`

The four retained-input selection pins are unchanged from Plan 186. They remain separate and nonadditive, and introduce no current-operation, resolved-identity, missing-business, or all-business completeness claim.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 128,001,777,664 bytes against a 13,309,329,011-byte requirement. The plan remains unapproved and unexecuted. No source acquisition, network request, reconciliation stage, production pointer change, or production enrollment occurred.

Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 186 and all earlier plans or approvals are superseded without execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261005-187 --expected-plan-sha256 df55ca5979d40a9e3e4e931d65854e7a25e0d8c7c0de324ca2d97f3245c75a29
```
