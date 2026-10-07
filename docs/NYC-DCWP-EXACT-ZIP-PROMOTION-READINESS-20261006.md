# NYC DCWP exact-ZIP promotion readiness — October 6, 2026

Status: **HOLD — retained release verified, registration binding not current**

This review evaluates whether already-retained NYC Department of Consumer and Worker Protection Active/Premises license evidence can become a separate exact-ZIP matrix dimension. It performs no acquisition, network request, production enrollment, pointer mutation, identity merge, or matrix publication.

## Verified retained evidence

`npm run nyc-dcwp:verify` independently replayed the release selected by the current pointer and returned a valid 21-artifact release:

- Pointer: `data/business-sources/nyc-dcwp-active-license-sites/current.json`
- Pointer SHA-256: `b40d945a63eabe374af0397f074efdf4bfcedb2c76a6a67706b9c00cf18a6622`
- Selected release: `nyc-dcwp-active-premises-20260903-004437783Z-a00056e7`
- Source release: `nyc-dcwp-active-premises-2026-08-20-6c47b96b3ab94aec`
- Manifest SHA-256: `c8ad5ffeb5c970d07bc9a78e963a10e26003631b6303bd6e1eed4f004c5013d3`
- Source reference: `2026-08-20T13:24:53.000Z`
- 35,245 selected Active/Premises license records
- 34,397 accepted license records
- 31,163 normalized licensed sites and source Business Unique IDs
- 848 quarantined source records and 665 quarantined business groups
- 26,532 source-geocoded sites
- 1,550 positive source ZIP codes across a 37,828-row ZIP union
- 91,531,713 declared artifact bytes

The source policy remains `local-review-only` for record detail and allows aggregate distribution only with provenance and semantic limitations. Its SHA-256 is `9721be33fdc2744fe5336bdf00e00cb36e270335dc99271eb40ee935baa379c4`.

## Blocking registration mismatch

The dataset registration at `config/datasets/nyc-dcwp-active-license-sites.json` has SHA-256 `b22235e15a2d0fb0a6a0203ddceb4f205acb5c6e96028114b12b54c98f9ed79b`, but its `current_verified_release` still names `nyc-dcwp-active-premises-20260901-041708420Z-74171f7b` and declares 91,533,434 verified bytes. The current pointer selects the later independently verified `20260903` release with 91,531,713 declared artifact bytes.

Because the registration and pointer do not identify the same immutable release, the pointer cannot be promoted as an exact-ZIP authority yet. Updating only the registration would also invalidate downstream source-policy and lifecycle provenance hashes, so admission requires a governed successor chain rather than an in-place metadata edit.

## Required successor work

1. Publish a new versioned NYC DCWP dataset registration that pins the exact `20260903` manifest, manifest hash, byte total, source clock, and retained counts.
2. Rebuild and verify the downstream business-entity source-policy provenance and any lifecycle artifacts whose registration inventory changes.
3. Add a pointer-free exact-ZIP successor dimension only after those bindings agree.
4. Preserve the source-native meaning: Active/Premises municipal-license membership, not independently verified current or continuous operation, public access, solvency, all-business completeness, or cross-source identity.
5. Keep the proposed dimension nonadditive with `nyc_dcwp_license_location_profiles`; ZIP+4 remains separate and no parent-company relationship is inferred.

Until those steps are complete, the existing registry profile dimension remains available, but a second NYC DCWP site-count dimension must remain unadmitted.
