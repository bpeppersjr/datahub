# Broad organization adjacent evidence index

This pointer-free index records retained state/local evidence that is useful beside, but cannot satisfy, the 40 unresolved broad state/DC organization-layer gaps. It never promotes a municipal registry, industry license file, credential cohort, or childcare cohort into broad organization coverage.

## Governed release

- Selection: `config/broad-organization-adjacent-evidence-selection.json`
- Immutable release: `data/broad-organization-adjacent-evidence-index/releases/broad-organization-adjacent-evidence-index-1b609cdc273a49212fe9fe12`
- Release manifest SHA-256: `8b3fe4e080f1d0860caf1ae5e3c0b02f7b513a854fa43a62bc17e4ba5e9c1c3b`
- Coverage: 40 broad-layer gap jurisdictions; 11 have 12 retained adjacent cohorts and 29 explicitly have none indexed.
- Broad-layer gaps closed: 0.

Each evidence item retains its exact count, evidence kind, row unit, geography scope, release and source-release identity, manifest hash, source/reference date or explicit unknown, temporal/current-operation limitation, export policy, and coverage limitations. Current operation is never inferred.

## Deterministic build and verification

Run `npm run broad-org-adjacent:build` to reproduce the content-addressed immutable release. Run `npm run broad-org-adjacent:verify` to replay the pinned selection and source manifests, validate hashes and invariants, and compare the canonical artifact byte-for-byte. Neither command acquires data, enrolls production, or writes a current pointer.

## Read-only application view

The authenticated `GET /api/business-map/broad-organization-adjacent-evidence?state=CA` endpoint accepts one uppercase broad-gap jurisdiction code. It returns a path-free verified projection and fails closed if the canonical release cannot be verified. Unknown parameters, duplicate state parameters, non-GET methods, and jurisdictions outside the current 40-gap set are rejected.

Co*Tive shows the projection in the selected-state right-hand panel for the general-business category only when the selected jurisdiction remains a broad-layer gap. National IRS adjacent evidence is displayed separately so it is not confused with state/local retained cohorts. A gap with no indexed cohort explicitly displays “None retained”; it is never treated as zero businesses or completed coverage.

## Authority boundary

This index authorizes only the retained offline use recorded for each selected artifact. It does not authorize acquisition, network access, broad-layer admission, production execution, production enrollment, exports beyond the recorded policy, or pointer changes.
