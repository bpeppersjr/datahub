# Proposed retained-data production reconciliation — October 7, 2026

Plan 253 supersedes planning-only Plan 252 after adding conservative, read-only California childcare reporting eligibility. Production inputs and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-253`
- Plan confirmation SHA-256: `a70f64c0717b0f9c07a51f21ab78d12f7a43cdb323a1548352edaf9cbebe9017`
- Plan file SHA-256: `6e25f60e484c4fb5127826a34033966cc743d0f0ed205e6ff32f10fc267af9e4`
- Predecessor plan: `production-cms-directories-20261007-252`
- California reporting implementation SHA-256: `1ea21ec1f4fec8f4d24165ad7eb9bcafdc3e6ed4c121affacc28764df5d3737f`
- California enrollment implementation SHA-256: `1f04148c5676014c77c138ad7a2fc966a3b73e4d9cb4b50ed00e228fa337444b`
- State-access ledger implementation SHA-256: `15445808c3ad97cb719b8ee20bf513aa1b387cd6136e38f1589cf222c505791a`
- California internal source policy SHA-256: `0e8d348928e2f8f15237faefef2aaa5a0da5dbc3624dbf5f38774e9d681bd4b7`

The reporting reader deeply verifies one California app terminal receipt and both immutable child releases, then streams the normalized record artifact. It conserves source, accepted, and quarantine rows and produces bounded aggregates by source-reported state, separate ZIP5, source resource, and publisher status. ZIP4 remains separate quality evidence. No record-level artifact is published by this projection.

The optional enrollment contract accepts only an exact path and SHA-256 for a deeply verified `fixed-native-fetch` receipt. Missing enrollment remains `not-enrolled`; a missing enrolled receipt remains `unavailable`, never zero. Injected test receipts and retained-local-verification receipts cannot enroll themselves. The state-access ledger exposes eligible output as local childcare source-candidate evidence without changing the national registry, industry access classification, dispatch state, or completeness measures.

The projection preserves absent geocodes, reported-address semantics, ZIP/ZCTA separation, and null/false current-business, unique-identity, physical-site, national-completeness, and public-export claims. No fixed-native California receipt was enrolled by this change, so no provider rows were added to the running application.

Focused California app/reporting/enrollment and state-access verification passed 72 tests. Connector validation, lint, web and desktop builds, the desktop control-plane smoke, stop/relaunch restoration, single-listener check, and HTTP health check passed. Seven existing lint warnings remain. `npm audit --omit=dev` still reports the two known high-severity transitive advisories.

Read-only production preflight returned `READY`, revalidated every production pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The retained childcare, Minnesota credential, CMS hospital, and CMS nursing-home selections remain pinned with the `national-12g` profile. Available disk was 73,528,553,472 bytes against a 13,309,329,011-byte requirement.

No production reconciliation, California provider request, provider-row acquisition, enrollment file, national reporting admission, public export, schedule activation, or mutable pointer write occurred. Plan 252 and earlier plans are superseded without execution. Any production execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261007-253 --expected-plan-sha256 a70f64c0717b0f9c07a51f21ab78d12f7a43cdb323a1548352edaf9cbebe9017
```
