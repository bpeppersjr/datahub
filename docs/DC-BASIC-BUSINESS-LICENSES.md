# District of Columbia active Basic Business Licenses

`dc-basic-business-license-sites` is a governed, privacy-minimized source layer over the official District of Columbia Department of Licensing and Consumer Protection Basic Business License feed. The [Open Data DC catalog](https://opendata.dc.gov/datasets/DCGIS::basic-business-licenses) identifies the dataset as public, names DLCP as publisher, and assigns [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The connector reads the official [DCGIS FeatureServer layer](https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/DCRA/FeatureServer/0) without credentials.

The source says most businesses need a Basic Business License to operate legally in the District. This is still a licensing view rather than a census of all businesses. The connector selects only rows whose exact source values are `LICENSESTATUS=Active` and `LICENSETYPE=Business License`; inclusion is not independent proof of continuous operation, public access, solvency, or compliance with every other requirement.

## Privacy and grouping boundary

Owner names, agent names/entities, billing addresses, parcel/lot strings, and the source's unusably rounded latitude/longitude fields are excluded at query time. Entity names may identify sole proprietors, and premises may be residences, so selected source rows and all normalized record-level entities remain `local-review-only` even though the source license permits redistribution. Aggregate ZIP/source counts may be redistributed with CC BY 4.0 attribution and the documented semantic limits.

Multiple rows can describe different licensed activities for the same `CUSTOMERNUMBER`. The connector groups them into one provisional organization, physical site, and establishment only when name and premise evidence are consistent. Every activity row and GlobalID remains source-backed evidence. Missing publishable names, PO Boxes, invalid/unmapped U.S. ZIPs, conflicting groups, duplicate GlobalIDs, expired rows still labeled Active, and invalid coordinates are quarantined or fail their declared gate; ownership and parent-company relationships are never inferred.

## Geography and coordinates

Premise addresses are parsed conservatively from the source's comma-delimited U.S. address. ZIP values remain source-reported and are joined to the governed Census ZBP/ZCTA union without being promoted to current USPS assignments. The source's `X_COORDINATE` and `Y_COORDINATE` fields are official DC Master Address Repository Maryland State Plane NAD83 meters. The connector converts them deterministically from EPSG:26985 to WGS84, retains both observations and the transformation version, and never fabricates coordinates for out-of-District or ungeocoded premises. DC's [coordinate-system standard](https://octo.dc.gov/am/page/coordinate-system-standards) and [MAR data dictionary](https://octo.dc.gov/sites/default/files/dc/sites/octo/publication/attachments/DCGIS_MarDataDictionary_0.pdf) document that projection.

## Commands

```powershell
npm run dc-bbl:build
npm run dc-bbl:verify
```

Generated immutable releases live under `data/business-sources/dc-basic-business-license-sites`. The tracked connector, schema, dataset catalog, and source-policy files are the machine-readable contract.

## Cooperative cancellation preparation — September 7

The CLI now accepts parent IPC cancellation and termination signals through the shared cancellation adapter. The signal reaches network requests, native retry waits, gzip backpressure and hashing, source/group normalization, verification, and both checks before publication. Verification rethrows cancellation instead of collecting it as a quality error. Input/decompression streams are closed on early exit; output failures are retained and rejected even if they precede a partition's first write.

Cancellation before immutable publication closes all tracked writers and removes only this build's UUID staging directory after checking its absolute and canonical location. Existing releases, the current pointer, sibling staging, and ordinary non-cancelled failed staging remain intact. If the staging path changes or cleanup fails, the error requires inspection rather than claiming cleanup succeeded. Once the staging-to-release rename starts, the existing publication sequence finishes without further cancellation checks. Arbitrary staging IDs and unsafe release names are rejected by the publisher.

This is preparation, not automatic enrollment. Provider `Retry-After` handling and bounded network execution still require repair before this source can be added to the industry scheduler. The currently running production reconciliation pins the legacy connector JSON, including its old cancellation description; that file is intentionally unchanged until the pinned run finishes. Updating its cancellation contract is an explicit enrollment prerequisite, not a claim that the legacy description matches the new implementation. Source policies, normalization semantics, and production data pointers are unchanged.

Six added offline tests cover phase cancellation with previous/sibling preservation, native wait cancellation, pre-errored writers and blocked backpressure, retained ordinary failures and traversal rejection, verifier cancellation/missing gzip, and actual parent-to-CLI IPC cancellation using a network-free preload. These do not prove every post-rename storage-failure recovery path or make a live provider request. Existing immutable data requires no migration; the change may be reverted at source level after active connector work finishes, preserving all run evidence.

Verification passed all 493 repository tests, lint, web/desktop builds, desktop smoke, TypeScript, and the production audit with zero vulnerabilities. The local preview was stopped for the supervisor tests and restored afterward. Its empty stopped scheduler's lock was preserved as `data/refresh-schedules/owner-stopped-6824-20260907.lock` after confirming the exact owner had exited; this is manual recovery, not automatic lock reclamation. No production source or schedule was changed.
