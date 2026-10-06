# Proposed retained-data production reconciliation — October 6, 2026

Plan 202 is a planning-only successor to Plan 201 after correcting reproducible verifier commands, adding a pointer-free temporal/lifecycle reconciliation, expanding the exact-ZIP industry matrix to 41 dimensions with retained Minnesota construction evidence, and making Administration report validated industry-maintenance status.

- Run ID: `production-cms-directories-20261006-202`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261006-202.json`
- Plan confirmation SHA-256: `a4f7070ec34fff6949e6d07fa145c63a57af67acfdf881469692ea1f41366ebc`
- Plan file SHA-256: `d0a529243e457c0e1b72e028be2a91c7812c3579fad2e3637c3d92fea39fb623`
- Predecessor plan: `production-cms-directories-20261006-201`
- Implementation commit: the commit containing this document

The temporal/lifecycle reconciliation preserves the 30 source-cohort labels while applying the retained 15-source lifecycle taxonomy at profile scope. Fourteen classifications agree. Los Angeles is the single mismatch: its publisher cohort remains source-defined current as provenance, but 633,232 profiles with null source status remain effectively `unknown-source-status`. The effective source totals are 21 source-defined-current, seven non-active reporting, one annual aggregate, and one unknown. Verified-current complete coverage remains zero of 51 jurisdictions; active-business count and completeness remain null.

The pointer-free exact-ZIP v2.0 matrix adds `mn_residential_construction_credential_reported_address_rows` to the pinned v1.9 roster. It preserves 48,194 exact ZIP5 rows, 41 dimensions, and 1,975,954 cells. The Minnesota dimension contains 960 positive cohort ZIPs carrying 11,454 publisher credential rows and 47,234 explicit null/absent cells. One row on source-reported key `55262` remains an out-of-cohort sidecar, and one missing-ZIP row remains a separate sidecar. Source-reported address states are conserved but never treated as ZIP jurisdiction assignments; USPS validity, current operation, physical-site identity, uniqueness, and completeness remain unasserted.

Administration now validates the exact nine-segment, 51-jurisdiction, 459-cell retained-access summary before showing each maintenance segment's nationwide evidence percentage and temporal status counts. It explicitly states that maintenance selection grants no acquisition authority. Persisted selection and unsaved draft are distinguished, and stale or failed saves reload durable settings rather than leaving an ambiguous draft visible.

The selected temporal, exact-ZIP v1.9, and state exact-ZIP verifier commands now include their registered immutable manifests. The state-disposition documentation is synchronized with its selected 40-dimension release and 1,927,760-cell conservation.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 88,294,596,608 bytes against a 13,309,329,011-byte requirement.

No source acquisition, network request, candidate stage, production stage, mutable production pointer change, national production matrix publication, or production enrollment occurred. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 201 and all earlier plans or approvals are superseded without production execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261006-202 --expected-plan-sha256 a4f7070ec34fff6949e6d07fa145c63a57af67acfdf881469692ea1f41366ebc
```
