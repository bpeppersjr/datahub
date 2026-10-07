# Proposed retained-data production reconciliation — October 7, 2026

Plan 244 supersedes planning-only Plan 243 after retaining and independently verifying aggregate-only California CDSS childcare publisher-status and file-date evidence. Production inputs and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-244`
- Plan confirmation SHA-256: `9d5b07dc90f28ecda6734c72ee32d94bcf18ad5f7168a573d72f13b0816e7d8b`
- Plan file SHA-256: `56ab0d6af474ea0a9956abd139df288f1ae2e8ca26e9581fca9ac5a5add3692f`
- Predecessor plan: `production-cms-directories-20261007-243`

The bounded status preflight performed four official aggregate SQL requests: publisher-status counts and file-date counts for each of the two childcare resources. No provider row or personal field was requested or returned. Every aggregate count conserved the row totals pinned by the zero-record schema preflight.

Child Care Centers reported 4,448 CLOSED, 401 INACTIVE, 14,072 LICENSED, 24 ON PROBATION, and 481 PENDING rows, totaling 19,426. Family Child Care Homes reported 5,160 CLOSED, 415 INACTIVE, 13,986 LICENSED, 27 ON PROBATION, and 170 PENDING rows, totaling 19,758. Every row in both resources was counted under publisher file date `05252025`.

The immutable aggregate receipt is independently verified under manifest SHA-256 `856f8c6f6ca02e0919b5d8bbb3ead358f5391538ce3668d9bf3ef08b912cc52f`. `LICENSED` and `ON PROBATION` are retained as publisher-current candidates for later lifecycle review; they are not asserted as independent proof of current operation. The candidate lifecycle rule is not approved for admission.

Publisher-status-to-active lifecycle governance, CSV delivery or paginated DataStore acquisition authorization, physical-versus-mailing address meaning, ZIP5/ZIP4 parsing, suppression/redaction semantics, and the catalog/backend temporal disagreement remain unresolved. Current operation, statewide completeness, production admission, and current-pointer publication remain unclaimed or disabled.

Read-only production preflight returned `READY`, revalidated every production pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The four retained selections and `national-12g` profile remain pinned. Available disk was 73,921,204,224 bytes against a 13,309,329,011-byte requirement.

No production reconciliation, provider-row acquisition, production enrollment, credential operation, public export, or mutable source pointer write occurred. Plan 243 and earlier plans are superseded without execution. Any production execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261007-244 --expected-plan-sha256 9d5b07dc90f28ecda6734c72ee32d94bcf18ad5f7168a573d72f13b0816e7d8b
```
