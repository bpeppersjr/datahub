# Proposed retained-data production reconciliation — October 7, 2026

Plan 228 supersedes planning-only Plan 227 after pinning the immutable Census residual release to LF checkout bytes in `.gitattributes`. This prevents Windows CRLF conversion from invalidating the release hashes after a fresh Git checkout. Production inputs and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-228`
- Plan confirmation SHA-256: `f922aa10969df90f78ea1a46d58ff0af01b1855017368f89d023097380bac53c`
- Plan file SHA-256: `72e4dbd03f10683423f8ba591d0dd65b26aa59994a1fd10e758172e5dc04d80c`
- Predecessor plan: `production-cms-directories-20261007-227`

Residual release `us-census-non-zcta-state-residual-af772d3aa8d9f7a0266a0aa5e507d6ebf8bd4998` remains unchanged and verified: 56 state-equivalent GeoJSON artifacts, exact independent geometry and summary replay, portable LF bytes, and no ZIP/postal, land-classification, population, business-geography, industry-denominator, or completeness claim.

Read-only preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The four retained selections and `national-12g` profile remain pinned. Available disk was 76,497,080,320 bytes against a 13,309,329,011-byte requirement.

No acquisition, network request, reconciliation execution, production enrollment, or mutable source pointer write occurred. Plan 227 and earlier plans are superseded without execution. Any execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261007-228 --expected-plan-sha256 f922aa10969df90f78ea1a46d58ff0af01b1855017368f89d023097380bac53c
```
