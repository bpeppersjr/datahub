# Iowa coordinate-basis diagnostic

On September 10, 2026 at `19:14:43.066Z`, one bounded GET of the already documented public client bundle returned HTTP 200, 84,473 decoded bytes and SHA-256 `ac4732c23c25983148de71876f4a50201bd58032d942325fd71694b7fc2df9cc`. This exactly matches both client fingerprints retained with acquisition `3b1d21b1-6a7f-4ae1-8ed3-1f16a33d69b1`.

The diagnostic requested no `/Map/pins` records, executed no client code, used no credentials or redirects, performed no retry and retained no source-code body. It was capped at one MB and 20 seconds. The operator-recorded observation is `data/business-sources/ia-childcare/client-crs-checks/20260910-191443Z.json`; this is a diagnostic observation, not an app collection receipt or independent source-authentication proof.

The keyword scan found zero EPSG, WGS84, datum, spatial-reference/coordinate-reference-system or proj4 markers. It found one `/Map/pins` reference. This is a bounded scan, not an exhaustive proof that the publisher has no coordinate documentation. An unchanged client fingerprint and plausible latitude/longitude values do not establish the source datum, nor do map-library defaults.

The 1,476 retained Iowa points therefore remain `crs:null` and unavailable for county overlay. No existing source release, policy, record, postal field, eligibility flag or production pointer changed. Do not repeat this same client check merely to revisit the hold. The next useful evidence would be an explicit publisher coordinate declaration or an authorized technical inquiry identifying the coordinate basis of the returned fields.
