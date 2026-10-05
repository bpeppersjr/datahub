# State exact-ZIP industry evidence disposition

This pointer-free, local-review-only dataset assigns each retained exact-ZIP cohort member to one governed geography scope and aggregates 39 source dimensions.

## Scope rules

- `state:<FIPS>`: complete same-code Census ZCTA overlay, no material state crossing, within the 50 states or D.C.
- `territory:<FIPS>`: the same rule for Census state-equivalents 60, 66, 69, 72, and 78.
- `multi-state-material`: material state crossing; the dominant state is not used.
- `zcta-overlay-unresolved`: incomplete overlay or a valid matrix `zcta_geoid` absent from the retained crosswalk.
- `non-zcta-unassigned`: no same-code Census ZCTA; no state is inferred.
- `explicit-placeholder`: the explicit placeholder remains separate.

Assignments are Census polygon-area evidence only—not postal membership or business location.

## Governed release

- Release: `state-exact-zip-industry-evidence-disposition-09748258667a891ceae946954dbd778145791e8ad3d26ab6612827b8e29d03dd`
- Manifest SHA-256: `ba434ac7cfc67963291a338e50995453d34bb1dd79b4cb69b86504a95b3b4213`
- Artifact SHA-256: `456c23c36863adc4974d7a79d5aa19d5813b4d6e5e6473fc1d2ef24a62c9e264`
- Counts: 33,455 state/DC; 149 territory; 184 material crossings; 3 unresolved; 14,402 non-ZCTA; 1 placeholder.
- Conservation: 48,194 ZIP keys × 39 source dimensions = 1,879,566 evidence cells.

The manifest binds by exact SHA-256 to matrix 1.8, its cohort, the temporal qualification artifact, and the governed ZCTA crosswalk. Seven lifecycle dispositions and 35 joined buckets reconcile to independently derived national totals.

## Reproduction

```powershell
npm run state-exact-zip:build
npm run state-exact-zip:verify
```

The build reads retained inputs only and writes no current pointer. Verification targets the registered immutable release.

## Non-claims

This is not an authoritative USPS ZIP-to-state assignment, business count, all-business denominator, additive cross-industry total, current-operation verification, acquisition authority, runtime current pointer, or production enrollment. Source dimensions overlap.
