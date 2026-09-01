# California ABC active issued-license sites

This connector acquires the California Department of Alcoholic Beverage Control’s official daily CSV archive and publishes one governed provisional organization, physical premise, and establishment per accepted File Number group.

The source page says the export is refreshed each business day and contains pending and active records. Co*Tive Collector selects only rows where `Type Status` is exactly `ACTIVE` and `Lic or App` is exactly `LIC`. Application rows and every other status are counted and excluded before normalization. Multiple active license types under one File Number remain license assertions on one premise rather than becoming extra businesses.

## Privacy and source minimization

The official 26-column layout includes five mailing-address fields. The connector validates the entire header fingerprint but never writes those mailing fields to the selected source snapshot. The raw ZIP exists only during acquisition and is deleted before publication. No phone, email, owner, officer, agent, parent-company, network, or cross-source identity is collected or inferred.

The ABC glossary defines the business address as the physical address of the licensed business, but a licensee name can identify a person and a licensed premise can be a residence. Selected source rows are internal and normalized record-level entities, assertions, relationships, and match profiles remain `local-review-only`. Attributed aggregate counts retain source limitations.

## Status and geography semantics

`ACTIVE` is California ABC license standing at the source refresh. It does not independently prove continuous operation, public access, current hours, solvency, or compliance with every requirement. If an active row’s reported expiration predates observation, both facts remain visible and the connector does not silently override the source status.

Complete U.S. premise addresses contribute ZIP evidence and conditional provisional sites. PO Boxes, incomplete or unsupported addresses, conflicting File Number groups, malformed dates, and invalid ZIP/state evidence are quarantined. Source county and Census tract labels are retained as source evidence; they are not converted into authoritative jurisdiction assignments. ZIP values are not promoted to current USPS assignments.

## Commands

```powershell
npm run ca-abc:build
npm run ca-abc:verify
```

The machine-readable contracts are [`config/connectors/ca-abc-active-license-sites.json`](../config/connectors/ca-abc-active-license-sites.json), [`config/datasets/ca-abc-active-license-sites.json`](../config/datasets/ca-abc-active-license-sites.json), [`config/schemas/ca-abc-active-license-site.schema.json`](../config/schemas/ca-abc-active-license-site.schema.json), and [`config/source-policies/ca-abc-active-license-sites.json`](../config/source-policies/ca-abc-active-license-sites.json).

## Validated live release

The independently verified release `ca-abc-active-licenses-20260901-171940775Z-5e1347a9` is bound to source release `ca-abc-active-licenses-2026-09-01-21cd610f9c8a8b9f`, official `Last-Modified` instant `2026-09-01T10:50:26Z`, and archive SHA-256 `9c9b7bbd6f283549d9e40dd688da8cf88d41e8da86ff889ab9900184a1321649`.

It counts all 129,017 source rows and selects 105,654 rows marked both `ACTIVE` and `LIC`. Those rows produce 84,485 organization/premise/establishment groups with 105,417 retained license activities across 2,922 source ZIP codes. The connector quarantines 237 rows in 215 invalid groups and preserves 3,939 selected activities whose reported expiration predates source observation. The 22 verified artifacts total 63,757,247 bytes. The release is complete only for its declared source selection and remains local-review-only at record level.
