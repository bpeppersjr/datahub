# Proposed retained-data production reconciliation — October 7, 2026

Plan 224 is a planning-only successor to Plan 223 after adding an app-owned GEOS 3.13 WebAssembly capability for governed Census state-minus-ZCTA residual overlays. Production configuration, retained source selections, and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-224`
- Plan confirmation SHA-256: `782320a2cdf4dd0bb77a5a1c8fa589e916fa5097937f268d3bc198b742c27e6c`
- Plan file SHA-256: `487d3bc17d5f63222fc4b32e7c9fcd8f62c9729f481992321acd1062d8bed9b0`
- Predecessor plan: `production-cms-directories-20261007-223`

The capability uses validity repair, a fixed precision grid, polygonal extraction and fixed-precision overlay operations. Governed D.C. and Rhode Island probes now pass in focused tests; separate measured probes also produced valid residual multipolygons for California, Alaska, and Hawaii. No residual release, map overlay, park classification, tribal or Native classification, private-land classification, postal claim, business geography, or completion claim was published.

Read-only preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The same four retained selections and `national-12g` profile remain pinned. Available disk was 74,623,492,096 bytes against a 13,309,329,011-byte requirement.

No acquisition, network request, reconciliation execution, production enrollment, or mutable source pointer write occurred. Plan 223 and earlier plans are superseded without execution. Any execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261007-224 --expected-plan-sha256 782320a2cdf4dd0bb77a5a1c8fa589e916fa5097937f268d3bc198b742c27e6c
```
