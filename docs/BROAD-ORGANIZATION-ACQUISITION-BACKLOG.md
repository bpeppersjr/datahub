# Broad-organization acquisition backlog

The local-derived backlog is built from the validated 51-jurisdiction state business-source assessment catalog. It contains exactly the 43 jurisdictions whose `broad_layer_production_ready` assessment flag is false. Each full assessment is retained unchanged in the backlog record, including its provenance, publisher/product/access/price description, unresolved gates, official URLs, authorization flags, and strongest bounded next action.

The priority rule is deterministic and embedded in the artifact: AK, then DC, because bounded connector implementation is already authorized for those two; remaining entries sort by evidence date (newest first), bounded-connector authorization, production readiness, unresolved gate count (fewest first), and jurisdiction abbreviation. The first ten resulting jurisdictions are explicitly listed in the release. Priority is sequencing guidance only; it grants no acquisition, payment, row-bearing preflight, production, or pointer-change authority. Source actions performed and pointer changes remain zero.

Build offline from the checked-in assessment inputs:

```powershell
npm run broad-org-acquisition-backlog:build
npm run broad-org-acquisition-backlog:verify
```

The release is stored under `data/broad-organization-acquisition-backlog/releases/<release-id>/`. Output roots must stay under the canonical `APP_ROOT/data` directory and may not traverse a symlink or junction. The builder writes into a uniquely owned staging directory, writes `backlog.json` first and `manifest.json` last, verifies the complete staged release, then atomically renames the directory into its content-derived release name. Failed builds clean only their own staging directory; an existing immutable release is verified rather than overwritten. The manifest records artifact byte count and SHA-256, and there is deliberately no `current.json` or other mutable selection pointer. The verifier rejects unexpected files or directories.

The independent verifier validates the source assessment catalog, recomputes the exact projection and priority from that catalog, and checks the release identity, manifest policy, artifact bytes, and hashes. It rejects altered evidence or any widened authority even when the artifact and manifest checksums are recomputed. This artifact is an assessment backlog, not evidence that a source was acquired or that a candidate is production-ready.
