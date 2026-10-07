# Broad-organization matrix-gap projection

The immutable `broad-organization-matrix-gap-projection@1.0.0` release reconciles the current, independently verified national goal-completion matrix with the current verified broad-organization acquisition backlog. It reports the 40 current general-business matrix gaps while retaining every historical backlog and authorization-program release unchanged.

The projection is local-derived only. It covers the 50 states and DC, excludes all 11 jurisdictions whose broad layer is currently admitted (AK, CO, CT, DC, DE, FL, IA, NY, OR, PA, and TX), and preserves the assessment snapshots, unresolved gates, exclusions, and assessment provenance for each current gap. In particular, AK, DC, and TX remain in the historical backlog but are excluded from the current gap subset because their matrix broad-layer evidence is available. The other eight admitted retained sources are likewise not current gaps.

The verifier selects and replays the newest canonical matrix release, requires the current matrix schema, verifies the canonical backlog release, reconstructs the crosswalk, and checks release/artifact hashes. Releases are immutable and content-derived; the builder does not update a pointer. It performs no source acquisition or network requests and grants no authority.

The current release is `broad-organization-matrix-gap-projection-2026-10-07T05-23-37.982Z-2de794ce5041`, manifest SHA-256 `9b444d558b837024f07dbde4a42f1212a6864d5db287e95c2f103587c95417ac`. It binds the October 7 matrix and backlog, preserves 11 admitted broad layers and 40 explicit gaps, and performed zero source actions and network requests.

Commands:

```powershell
npm run broad-org-matrix-gaps:build
npm run broad-org-matrix-gaps:verify -- --manifest data/broad-organization-matrix-gap-projection/releases/<release-id>/manifest.json
```
