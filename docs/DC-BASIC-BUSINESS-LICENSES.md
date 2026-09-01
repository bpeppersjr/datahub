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
