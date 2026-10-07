# Proposed retained-data production reconciliation — October 7, 2026

Plan 225 supersedes planning-only Plan 224 after hardening the governed GEOS residual capability to independently replay the Census geography manifest and verify every selected ZCTA partition's descriptor, bytes, SHA-256 digest, and single-link file safety. Production configuration, retained source selections, and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-225`
- Plan confirmation SHA-256: `2cc0dc3c0ec345a83f47c829ecf5a52fb078d965d1365617a6f9c798ec30d849`
- Plan file SHA-256: `e9b99bbeb91c5f19ee9552bfbae73c82ff6ee2650c3e97832b10cb4ee7b39620`
- Predecessor plan: `production-cms-directories-20261007-224`

The capability uses validity repair, a fixed precision grid, polygonal extraction, and fixed-precision overlay operations. Governed D.C. and Rhode Island probes pass in focused tests. No residual release, map overlay, park classification, tribal or Native classification, private-land classification, postal claim, business geography, or completion claim was published.

Read-only preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The same four retained selections and `national-12g` profile remain pinned. Available disk was 73,803,526,144 bytes against a 13,309,329,011-byte requirement.

No acquisition, network request, reconciliation execution, production enrollment, or mutable source pointer write occurred. Plan 224 and earlier plans are superseded without execution. Any execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261007-225 --expected-plan-sha256 2cc0dc3c0ec345a83f47c829ecf5a52fb078d965d1365617a6f9c798ec30d849
```
