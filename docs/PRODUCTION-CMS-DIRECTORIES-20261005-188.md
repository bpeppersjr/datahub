# Proposed retained-data production reconciliation — October 5, 2026

Plan 188 is a planning-only successor to Plan 187 after Co*Tive refined the explicit exact-ZIP source-evidence state heat map in commit `57aece0`. The evidence mode now replaces availability-only category controls, states its governed same-code Census ZCTA denominator beside the map, preserves the dataset-availability view as the default, and keeps territories, material cross-state ZCTAs, unresolved overlays, non-ZCTA keys, and the placeholder outside state heat. It does not claim business completeness, business share, current operation, or a USPS ZIP-to-state assignment. This document does not approve or execute production reconciliation.

- Run ID: `production-cms-directories-20261005-188`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261005-188.json`
- Plan confirmation SHA-256: `960a40211c58c02d88bb90288e91ad3e0df7198c49f0803b6f385b1cd3211a21`
- Plan file SHA-256: `dab3187ac5a39be5b9a9a0caf82ad0bd02d4985311875823b5db09a668cbaaa7`
- Plan 187 predecessor confirmation SHA-256: `df55ca5979d40a9e3e4e931d65854e7a25e0d8c7c0de324ca2d97f3245c75a29`
- Plan 187 predecessor file SHA-256: `4819c40dcc2a3d3d25e7d381b98ec93414fd7864ba38fe0ba80f984da792db80`
- Implementation commit: `57aece0`

The four retained-input selection pins are unchanged from Plan 187. They remain separate and nonadditive, and introduce no current-operation, resolved-identity, missing-business, or all-business completeness claim.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 127,894,900,736 bytes against a 13,309,329,011-byte requirement. The plan remains unapproved and unexecuted. No source acquisition, network request, reconciliation stage, production pointer change, or production enrollment occurred.

Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 187 and all earlier plans or approvals are superseded without execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261005-188 --expected-plan-sha256 960a40211c58c02d88bb90288e91ad3e0df7198c49f0803b6f385b1cd3211a21
```
