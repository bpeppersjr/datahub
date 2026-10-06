# Proposed retained-data production reconciliation — October 6, 2026

Plan 194 is a planning-only successor to Plan 193 after Co*Tive added a zero-write, exact-pinned projection prerequisite for Washington L&I contractor-organization mailing-address evidence. The projection replays the already retained source and conserves 74,030 eligible address observations across 3,113 ZIP5 values plus 111 missing or ineligible observations. It does not publish or register a new exact-ZIP matrix release, does not complete Washington's broad-jurisdiction gap, and makes no site, establishment, current-operation, all-business-completeness, or production-enrollment claim. This document does not approve or execute candidate or production reconciliation.

- Run ID: `production-cms-directories-20261006-194`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261006-194.json`
- Plan confirmation SHA-256: `0d6c46f9c98d37ac0a670a3ce87a494b33996277914f9d20ef494c0de3e93a20`
- Plan file SHA-256: `4aea8f7d07fe1eb595475a347b2d97e8f5ad1d4ac54971e7297fea71e76c9b88`
- Predecessor plan: `production-cms-directories-20261006-193`
- Implementation commit: the commit containing this document

The retained childcare, Minnesota credential, CMS hospital, and CMS nursing-home selections remain separately pinned and nonadditive. They introduce no all-business denominator, nationwide completeness, complete geocoding, resolved-identity, USPS-operational, or verified-current-operation claim.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 93,413,969,920 bytes against a 13,309,329,011-byte requirement. No source acquisition, network request, candidate stage, production stage, pointer change, matrix publication, or production enrollment occurred.

Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 193 and all earlier plans or approvals are superseded without production execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261006-194 --expected-plan-sha256 0d6c46f9c98d37ac0a670a3ce87a494b33996277914f9d20ef494c0de3e93a20
```
