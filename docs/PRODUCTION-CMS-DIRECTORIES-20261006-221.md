# Proposed retained-data production reconciliation — October 6, 2026

Plan 221 is a planning-only successor to Plan 220 after extending Co*Tive's operational industry-status contract to distinguish publisher currency from the timestamp at which a retained source was observed. It also repairs the National Objective Readiness UI binding to the current source-policy-bound lifecycle release. Production configuration and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261006-221`
- Plan confirmation SHA-256: `529a08039af6a41124dd179d9ac902e3e46c19b6177974dddb4e323a663d306d`
- Plan file SHA-256: `46a6ea1a548b9ca8b23c4c068d03ee22d0fe8d17b30d775ed874dd27d9f0bea2`
- Predecessor plan: `production-cms-directories-20261006-220`

The industry-status API now preserves `publisher_currency_basis` and `retained_observed_at` separately. A retained observation is not presented as a publisher reference date, a within-review determination, or current-operation proof. The existing `missing-source-reference` status remains intact where publisher currency is unmeasured. No business-completeness, geocode-completeness, USPS-validity, or current-operation claim was widened.

The National Objective Readiness UI now validates the current lifecycle manifest and its explicitly bound source-policy provenance and predecessor lifecycle. This is an integrity correction only; the objective remains not accepted and all existing blockers and null completeness claims remain unchanged.

Read-only preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The same four retained selections and `national-12g` profile remain pinned. Available disk was 74,682,294,272 bytes against a 13,309,329,011-byte requirement.

No acquisition, network request, reconciliation execution, production enrollment, or mutable source pointer write occurred. Plan 220 and earlier plans are superseded without execution. Any execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261006-221 --expected-plan-sha256 529a08039af6a41124dd179d9ac902e3e46c19b6177974dddb4e323a663d306d
```
