# Current-matrix broad-organization authorization wave

This separate immutable `broad-organization-current-matrix-authorization-wave@1.0.0` release is derived from the independently verified current matrix-gap projection. It selects exactly the ten smallest historical backlog priorities that remain among the 40 current gaps: IL, MS, AR, KY, HI, KS, NV, UT, WA, and OK. AK, DC, and TX are not selected because their broad layers are currently admitted. The wave accounts for 10 selected plus 30 remaining current gaps; it does not rewrite the historical 43-jurisdiction backlog, authorization program, or first-wave packet.

Every state and gate item is explicitly `approval-only` and `HOLD`. Full assessment snapshots, gate provenance, and required exclusions are preserved. The packet grants no acquisition authority and performs no source, network, pointer, or production action.

Build and verify a release locally:

```powershell
npm run broad-org-current-wave:build
npm run broad-org-current-wave:verify -- --manifest data/broad-organization-current-matrix-authorization-wave/releases/<release-id>/manifest.json
```
