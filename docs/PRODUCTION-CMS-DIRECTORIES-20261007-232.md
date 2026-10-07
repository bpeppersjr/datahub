# Proposed retained-data production reconciliation — October 7, 2026

Plan 232 supersedes planning-only Plan 231 after adding an explicit guarded “discover latest” mode to the USDA Organic INTEGRITY metadata preflight. Production inputs and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-232`
- Plan confirmation SHA-256: `caf6c2f42e731dfa744d7544da02482fe9389c432e2d83da41b8367bc968948a`
- Plan file SHA-256: `010f8b1b9d0dbba0244d6d0ccb3dbf2dfaa04344b9355be8b1da6d001d8a2901`
- Predecessor plan: `production-cms-directories-20261007-231`

The new CLI mode lets Co*Tive select the newest exact monthly workbook link found in one bounded official history-page response instead of requiring an operator to guess a URL. It preserves the existing 64 KiB response cap, redirect denial, exact USDA host/path validation, zero workbook requests, zero source-row acquisition, no pointer write, and default-denied live acquisition. An October 7 live metadata preflight made its single permitted history request and failed closed because the returned server HTML exposed no exact monthly workbook link. It made no workbook request and imported no data.

Read-only production preflight returned `READY`, revalidated every production pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The four retained selections and `national-12g` profile remain pinned. Available disk was 76,224,327,680 bytes against a 13,309,329,011-byte requirement.

No production reconciliation, production enrollment, or mutable source pointer write occurred. Plan 231 and earlier plans are superseded without execution. Any production execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261007-232 --expected-plan-sha256 caf6c2f42e731dfa744d7544da02482fe9389c432e2d83da41b8367bc968948a
```
