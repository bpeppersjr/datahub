# Proposed retained-data production reconciliation — October 7, 2026

Plan 248 supersedes planning-only Plan 247 after adding the first standalone Co*Tive California childcare acquisition operation. Production inputs and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-248`
- Plan confirmation SHA-256: `c1aeeb950725915cfe08c9c1722922e65ba0ceef52e26a141190a678a2d18bc6`
- Plan file SHA-256: `e90648318166e78331bc74e3e200b4d16a0ba3cf21f14e6a6c7a987c8af564a4`
- Predecessor plan: `production-cms-directories-20261007-247`
- California app connector SHA-256: `8b9f3eb30f142e4a426257215b63a0f8f66b69991c0bccf76ceefe1a94c3d21b`

The standalone operation persists a UUID-scoped start record before acquisition, holds application ownership and one cross-output California publisher lock, runs the bounded selected-field DataStore acquisition, binds the independently verified 39,184-row immutable release, and writes a terminal receipt last. Failed and cancelled operations retain inspection-required terminal evidence. Unknown publisher locks are never stolen.

An explicit retained manifest can be verified and adopted offline without contacting the publisher or rewriting the retained release. Automatic retry, restart, scheduling, normalization, production admission, current-pointer mutation, and public export remain disabled. The CLI is `npm run ca-childcare:build`; it requires an intentional operator invocation and is not exposed through a live management dispatch route in this change.

Synthetic tests covered full successful acquisition, retained-input reuse with a transport that fails if called, concurrent operation exclusion, failure, cancellation, receipt tampering, connector registration, and control-plane startup. No live California provider request or provider-row acquisition occurred.

The exhaustive repository test run completed 3,915 tests and exposed one residual-map terminology mismatch unrelated to the operation. That exact guard was corrected and rerun successfully with the California and control-plane suites. Lint has no errors, builds pass, and the two previously known high-severity transitive advisories remain reported by `npm audit --omit=dev`.

Read-only production preflight returned `READY`, revalidated every production pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The four retained selections and `national-12g` profile remain pinned. Available disk was 73,638,731,776 bytes against a 13,309,329,011-byte requirement.

No production reconciliation, California provider-page request, provider-row acquisition, normalization, production enrollment, public export, or mutable source pointer write occurred. Plan 247 and earlier plans are superseded without execution. Any production execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261007-248 --expected-plan-sha256 c1aeeb950725915cfe08c9c1722922e65ba0ceef52e26a141190a678a2d18bc6
```
