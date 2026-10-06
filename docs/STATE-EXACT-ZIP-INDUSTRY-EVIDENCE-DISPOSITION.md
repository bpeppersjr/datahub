# State exact-ZIP industry evidence disposition

This pointer-free, local-review-only dataset assigns each retained exact-ZIP cohort member to one governed geography scope and aggregates 40 industry evidence dimensions.

## Scope rules

- `state:<FIPS>`: complete same-code Census ZCTA overlay, no material state crossing, within the 50 states or D.C.
- `territory:<FIPS>`: the same rule for Census state-equivalents 60, 66, 69, 72, and 78.
- `multi-state-material`: material state crossing; the dominant state is not used.
- `zcta-overlay-unresolved`: incomplete overlay or a valid matrix `zcta_geoid` absent from the retained crosswalk.
- `non-zcta-unassigned`: no same-code Census ZCTA; no state is inferred.
- `explicit-placeholder`: the explicit placeholder remains separate.

Assignments are Census polygon-area evidence only—not postal membership or business location.

## Governed release

- Release: `state-exact-zip-industry-evidence-disposition-2e71fa9aa3aee1398399674634d5537fc33c19427f1dfa9d97196656c841689c`
- Manifest SHA-256: `d2f2114dfdbf6788eea0dd2335c9a9383673d61baf557486ebd2e8aba7ffbf41`
- Artifact SHA-256: `d29f7047dfe713fd9e95ede930edd0d2642eaa59158e3d2398ee3d5945658c84`
- Counts: 33,455 state/DC; 149 territory; 184 material crossings; 3 unresolved; 14,402 non-ZCTA; 1 placeholder.
- Conservation: 48,194 ZIP keys × 40 industry dimensions = 1,927,760 evidence cells and 2,400 geography-scope/industry disposition rows.

The manifest binds by exact SHA-256 to matrix 1.9, its cohort, the temporal qualification artifact, and the governed ZCTA crosswalk. Seven lifecycle dispositions and the closed cell-status/lifecycle cross-classes reconcile to independently derived national totals.

## Reproduction

```powershell
npm run state-exact-zip:build
npm run state-exact-zip:verify
```

The build reads retained inputs only and writes no current pointer. Verification targets the registered immutable release.

## Non-claims

This is not an authoritative USPS ZIP-to-state assignment, business count, all-business denominator, additive cross-industry total, current-operation verification, acquisition authority, runtime current pointer, or production enrollment. Source dimensions overlap.
