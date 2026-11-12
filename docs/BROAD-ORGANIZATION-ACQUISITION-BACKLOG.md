# Broad-organization acquisition backlog

The local-derived backlog joins the validated 51-jurisdiction state business-source assessment catalog to the independently verified newest national goal-completion matrix. It contains exactly the matrix's current 40 general-business broad-layer gaps. Alaska is excluded because its broad layer is already admitted; the backlog never treats a stale assessment readiness flag as current coverage truth. Each full assessment is retained unchanged in the backlog record, including its provenance, publisher/product/access/price description, unresolved gates, official URLs, authorization flags, and strongest bounded next action.

The priority rule is deterministic and embedded in the artifact: current gaps sort by assessment evidence date (newest first), bounded-connector authorization, unresolved gate count (fewest first), and jurisdiction abbreviation. The first ten resulting jurisdictions are explicitly listed in the release. Priority is sequencing guidance only; it grants no acquisition, payment, row-bearing preflight, production, or pointer-change authority. Source actions, network requests, and pointer changes remain zero.

Build offline from the checked-in assessment inputs:

```powershell
npm run broad-org-acquisition-backlog:build
npm run broad-org-acquisition-backlog:verify
```

The release is stored under `data/broad-organization-acquisition-backlog/releases/<release-id>/`. Output roots must stay under the canonical `APP_ROOT/data` directory and may not traverse a symlink or junction. The builder writes into a uniquely owned staging directory, writes `backlog.json` first and `manifest.json` last, verifies the complete staged release, then atomically renames the directory into its content-derived release name. Failed builds clean only their own staging directory; an existing immutable release is verified rather than overwritten. The manifest records artifact byte count and SHA-256, and there is deliberately no `current.json` or other mutable selection pointer. The verifier rejects unexpected files or directories.

The independent verifier validates both sources, recomputes the exact 40-gap join and priority, and checks the release identity, matrix lineage, manifest policy, artifact bytes, and hashes. It rejects altered evidence, a reintroduced admitted jurisdiction, denominator drift, or any widened authority even when artifact and manifest checksums are recomputed. Default selection verifies the retained release envelopes, then requires a unique v3 release in the newest cohort with the verified matrix's observation time and release ID. Missing, corrupt, or ambiguous newest inputs make current verification fail. An explicit manifest path still verifies the retained v1, v2, and October v3 releases against their immutable digest pins.

The current release `broad-organization-acquisition-backlog-2026-11-12T05-17-11.911Z-145f1512454f` binds `national-goal-completion-20261112051711-1b351542`. Its manifest SHA-256 is `203d2c6455f2074e4d9bbee4d466f781b15acd249c7e034b1e759229b7743362` and its artifact SHA-256 is `145f1512454f6d7842c9e2024a0438ade6604f30ea5f7c838159c2f23b8872fe`. The first ten priorities are CA, ID, IL, OH, KY, NC, NH, OK, HI, and MA.

Vermont's primary assessment is `vt-business-source-reassessment-2026-10-03`. The backlog also carries the digest-bound October 7 supplemental document-prerequisite evidence, including its application-shell observation, address and status findings, unresolved gates, and bounded next action. The primary assessment determines Vermont's priority.
