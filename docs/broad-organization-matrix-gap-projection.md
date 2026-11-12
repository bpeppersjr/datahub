# Broad-organization matrix-gap projection

The immutable `broad-organization-matrix-gap-projection@1.0.0` release reconciles the independently verified national goal-completion matrix with its verified v3 broad-organization acquisition backlog. It reports the 40 current general-business matrix gaps and their backlog priorities.

The projection covers the 50 states and DC. AK, CO, CT, DC, DE, FL, IA, NY, OR, PA, and TX have admitted broad-layer evidence. Each of the 40 gaps carries its complete backlog assessment snapshot, unresolved gates, exclusions, and provenance. The projection keeps the existing `historical_backlog_jurisdictions` and `historical_backlog_member` field names for compatibility. For each release, they describe the backlog identified by `source_backlog`.

Default verification independently replays the newest matrix and backlog, reconstructs the crosswalk, and requires the newest projection release to match both inputs and the exact derived bytes. Missing, corrupt, or ambiguous newest releases fail verification. Explicit historical manifests are verified against their immutable digest pins. Releases are content-derived and the builder performs zero source actions, network requests, and pointer changes.

The current release `broad-organization-matrix-gap-projection-2026-11-12T05-17-11.911Z-eb4723fed2ff` binds matrix `national-goal-completion-20261112051711-1b351542` and backlog `broad-organization-acquisition-backlog-2026-11-12T05-17-11.911Z-145f1512454f`. Its manifest SHA-256 is `20c2bbe685d99647486d70e373e804a57551bdd8118c68f3aad47fd35fb30f75` and its artifact SHA-256 is `eb4723fed2ffc16e1237acb760f999805956e27685e73484389c1e16a6d8445b`.

Commands:

```powershell
npm run broad-org-matrix-gaps:build
npm run broad-org-matrix-gaps:verify
npm run broad-org-matrix-gaps:verify -- --manifest data/broad-organization-matrix-gap-projection/releases/<release-id>/manifest.json
```
