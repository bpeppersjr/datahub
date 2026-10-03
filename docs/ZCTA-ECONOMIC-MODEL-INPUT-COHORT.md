# ZCTA economic model input cohort

`zcta-economic-model-input-cohort@1.0.0` is immutable, pointer-free,
pre-production input evidence. It does not allocate GDP, authorize modeling, admit
an operational USPS denominator, or change business collection coverage.

## Contract and proof boundary

The explicit retained readiness manifest path and SHA-256 are the trust root.
Publication and independent verification authenticate its consumed bytes, its
readiness JSONL, all four pinned dependency manifests (geography, ZBP, crosswalk,
BEA), the exact crosswalk relationship and BEA county artifacts, and the retained
BEA policy. Dependency release/hash agreement and geography identity are checked.
Projection replays all relationships against readiness county/state membership,
material counts and missing/direct BEA counts. It does not recompute polygon
intersections, reauthenticate upstream downloads, or reread the geography/ZBP raw
artifacts; their context remains inherited from the pinned readiness evidence.

Each relationship preserves its source ID, ZCTA, county/state identifiers,
material-intersection flag, direct-BEA **row presence**, 2024 reference year and
unit labels, ZCTA population/housing context, historical ZBP publication status,
and topological multi-county/state flags. Row presence does not assert that every
BEA numeric measure is available. Population/housing are repeated ZCTA context,
not county-fragment observations and must not be summed across relationships.
Multi-jurisdiction flags include nonmaterial intersections, not only material ones.

`relationship_input_status=eligible-input-only` means only that a direct BEA county
row and a material intersection both exist. Other relationships retain explicit
missing-direct-BEA and/or nonmaterial reason codes. This is never model approval:
every relationship has `model_status=withheld` and mandatory policy-allocation and
missing-demographic-slice blockers. No raw/normalized area shares, allocation
weights, numeric GDP, or demographic slices are emitted. Unit labels are strings,
not numeric measures. ZCTA identifiers are not asserted to be operational ZIPs;
this derivative does not alter ZIP5/ZIP4 records.

## Safety and lifecycle

Public interfaces accept explicit `sourceManifest`, `sourceManifestSha256`,
`signal`, and (publisher only) `createdAt`. There are no alternate loader, output
root, or transport hooks. All files are canonical, app-contained, bounded regular
single-link inputs. SHA checks cover the same bytes parsed. Input/artifact identity
and hashes are rechecked before success, before installation and after installation.
Cancellation is cooperative during bounded streaming and projection.

Limits are 40,000 readiness rows/30 MB, 100,000 relationships/60 MB, 4,000 BEA
county rows/5 MB, 64 KB JSONL lines, 2 MB dependency manifests, and 12 MB/10,000
rows per two-digit ZCTA output bucket. The verifier reconstructs every output row,
summary and sorted membership digest; it rejects extra files and changed bytes.
This is a bounded full-cohort projection, not a one-ZCTA runtime lookup service.

Exclusive content-addressed locks serialize each release. Owned files are synced,
the manifest is written last, and verified staging is atomically renamed. Failures
before publication remove only owned staging; post-installation failures retain
the release and report inspection required. Crash-held locks require inspection,
not automatic PID-based reclaim. Filesystem checks are not an OS-level guarantee
against a privileged writer racing every syscall. There is no current pointer,
production enrollment, acquisition, network request, API, or UI integration.

## Commands

```powershell
npm run zcta-economic-model-input-cohort:build -- --source-manifest <readiness-manifest> --source-sha256 <SHA256> --created-at <ISO-UTC>
npm run zcta-economic-model-input-cohort:verify -- <cohort-manifest> --source-manifest <readiness-manifest> --source-sha256 <SHA256>
node --test runner/zcta-economic-model-input-cohort.test.mjs
```

## Native evidence

Offline publication and a separate full source-bound verifier succeeded for
`zcta-economic-model-input-cohort-0d42c0d02977132557b91708a5b58f4fbbaab2dfc2c43b2517c267c7b79839fe`.
Manifest SHA-256:
`2eced7894671c256800b4e08edfac48b343fc4629725aecb67203418ecc00d7e`.
Clock: `2026-10-03T04:15:00.000Z`; 99 artifacts, 52,407,041 bytes.

The exact tracked registration is
`config/datasets/zcta-economic-model-input-cohort.json`. It binds the full source
identities, manifest/inventory hashes, membership digests and unchanged claims.

| Measure | Count |
|---|---:|
| County–ZCTA relationships | 65,631 |
| Distinct governed ZCTAs | 33,791 |
| Direct-BEA + material relationship inputs only | 46,320 |
| Blocked relationship inputs | 19,311 |
| Relationships missing a direct BEA row | 1,192 |
| Nonmaterial relationships | 18,630 |
| ZCTAs with incomplete direct-BEA relationships | 623 |
| Relationships withheld from modeling | 65,631 |

Missing-BEA and nonmaterial categories overlap and must not be added. All model,
GDP-output, active-business, operational-ZIP and production claims remain false.
The release changes no denominator and makes no nationwide completeness claim.
