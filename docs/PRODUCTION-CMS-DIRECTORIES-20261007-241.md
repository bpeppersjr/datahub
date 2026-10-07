# Proposed retained-data production reconciliation — October 7, 2026

Plan 241 supersedes planning-only Plan 240 after clarifying Co*Tive's application reporting boundaries. The primary state workspace now reports retained evidence rather than implying all-business completion. Non-ZCTA and residual land remain nonblocking state-level context, and the Administration workspace continues to persist the industries selected for maintenance. Production inputs and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-241`
- Plan confirmation SHA-256: `9c683e4cb78302d0ae4057df85ce0d253142a955aaf889116fdcf7a824ee0119`
- Plan file SHA-256: `c3b9d9f5051904518dd554662a8e6cdbe81a251595a6be95ba45b3282b1b07a1`
- Predecessor plan: `production-cms-directories-20261007-240`

The application does not require an authoritative all-business denominator, complete business geocoding, or nationwide industry completeness to display retained evidence. Its availability percentages compare governed dataset/state cells only. Private or special-purpose ZIP evidence may lack population and a same-code Census ZCTA. Park, protected-land, tribal or Native territory, and private-property classifications remain unknown unless a governed overlay supplies them.

Unresolved land outside selected Census ZCTAs is retained as an optional topology-verified residual artifact for each of the 56 Census state equivalents. This provides state-level placement without inventing a ZIP. Cardinal subdivisions remain unavailable pending a governed topology rule. Missing residual context never blocks the state/ZCTA map or industry status.

The Administration tab persists maintenance intent for nine operational industry segments and reports the share of 51 jurisdictions with retained source-access evidence for each segment. Those percentages are not business completeness. Selecting an industry does not authorize acquisition, start a download, change evidence, or alter production enrollment.

Read-only production preflight returned `READY`, revalidated every production pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The four retained selections and `national-12g` profile remain pinned. Available disk was 73,941,086,208 bytes against a 13,309,329,011-byte requirement.

No production reconciliation, source acquisition, production enrollment, credential operation, public export, or mutable source pointer write occurred. Plan 240 and earlier plans are superseded without execution. Any production execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261007-241 --expected-plan-sha256 9c683e4cb78302d0ae4057df85ce0d253142a955aaf889116fdcf7a824ee0119
```
