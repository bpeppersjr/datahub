# Proposed retained-data production reconciliation — October 5, 2026

Plan 189 is a planning-only successor to Plan 188 after Co*Tive added a fail-closed reconciliation guard for the eight production-ready state publishers and their nine retained exact-ZIP dimensions in commit `a2950e2`. The guard binds source policies, releases, manifests, provenance, transformations, ZIP5-only keys, separate ZIP+4 treatment, and source-row conservation. The same commit also makes SNAP processing parse the exact compressed snapshot that was checksum-verified, closing a checksum/read timing gap. Neither change claims all-business completeness, complete geocoding, verified current operation, or universal USPS ZIP coverage. This document does not approve or execute production reconciliation.

- Run ID: `production-cms-directories-20261005-189`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261005-189.json`
- Plan confirmation SHA-256: `fb6a6aff59e1d9460f15d72f2bf3546ff51939990f31f8bb6ba80cb58de27d29`
- Plan file SHA-256: `17b0802dc5b77339c3ed84aa75d5a11c4de8489b8fd97648094d89e661eba8ac`
- Plan 188 predecessor confirmation SHA-256: `960a40211c58c02d88bb90288e91ad3e0df7198c49f0803b6f385b1cd3211a21`
- Plan 188 predecessor file SHA-256: `dab3187ac5a39be5b9a9a0caf82ad0bd02d4985311875823b5db09a668cbaaa7`
- Implementation commit: `a2950e2`

The four retained-input selection pins are unchanged from Plan 188. They remain separate and nonadditive, and introduce no current-operation, resolved-identity, missing-business, or all-business completeness claim.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 127,513,759,744 bytes against a 13,309,329,011-byte requirement. The plan remains unapproved and unexecuted. No source acquisition, network request, reconciliation stage, production pointer change, or production enrollment occurred.

Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 188 and all earlier plans or approvals are superseded without execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261005-189 --expected-plan-sha256 fb6a6aff59e1d9460f15d72f2bf3546ff51939990f31f8bb6ba80cb58de27d29
```
