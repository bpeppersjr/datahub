# Missouri corporate bulk-product documentation reference

The versioned `mo-corporate-bulk-product-reference-2026-11-13` reference remains **HOLD**, with zero required source files, zero acquired records, no current schema compatibility proof, no connector readiness and no acquisition authority. It supplements the immutable October assessment without changing the connector registry, readiness wave, application, production pointers or coverage totals.

## Evidence and limits

The current [official Forms and Services catalog](https://www.sos.mo.gov/business/formsandservices.asp) lists searches, filings, copies and forms. No bulk route, order, schema or price was found in that reviewed page. The coordinating agent observed HTTP 200, 21,964 bytes and SHA-256 `1a738de5c4ce9efb23c9df18967e814c97c0226988676e12902f42dcd7360547` on November 13, 2026. This observation does not establish that no bulk product exists.

The [official Corporations About page](https://www.sos.mo.gov/business/corporations/about.asp) describes current status, entity type, names, formation date, registered agent and service address information, while noting that many information types need not be filed. The coordinating agent observed HTTP 200, 28,976 bytes and SHA-256 `53e8b0212405f1d8b903b7e3b816f5dd01d5dbc69b77dcb63358efd5aea0017c`. These categories are not a bulk schema. A service address does not establish an operating site, and legal status does not establish operating status or statewide business completeness.

Official search indexes the [historical report URL](https://www.sos.mo.gov/CMSImages/SOSMain/AshcroftAdministrationAccomplishments.pdf) as *Building A Brighter & Stronger Missouri: Eight Years of Accomplishment 2017-2025*. The retained discovery queue 7 records the report's claim that corporate bulk downloads were implemented in November 2022. This remains historical implementation provenance only; the report was not successfully retrieved in this review. The coordinating agent's direct HttpClient request returned HTTP 404 with a 721-byte HTML response, SHA-256 `f4e301a60e8d885351b8df5614c54f3acc90435022b37fb6803b9a9bf0b0e09a`. That digest identifies the error response, not a PDF. No PDF is retained.

The JSON attributes supplied remote observations to the coordinating agent. The standalone loader checks local evidence integrity; it does not re-fetch or independently verify the remote resources. Historical implementation and current catalog descriptions establish no current product availability, delivery route, contract, schema compatibility, price, automation permission or reuse rights.

Before any connector or acquisition, verify the current route, unsigned contract, person-free schema, identifiers, entity scope, status semantics, address roles, release/change contract, control totals, fees and rights. No provider contact, account creation, terms acceptance, payment, automated search, record request or publication is authorized by this reference.

## Local verification

```powershell
node scripts/verify-mo-corporate-bulk-product-reference.mjs
node --test runner/mo-corporate-bulk-product-reference.test.mjs
npx eslint runner/mo-corporate-bulk-product-reference.mjs runner/mo-corporate-bulk-product-reference.test.mjs scripts/verify-mo-corporate-bulk-product-reference.mjs
```

The loader pins exact JSON bytes and parsed content, rejecting altered evidence, missing or unknown fields, removed gates and widened authority. It performs local reads only and writes no artifacts. Tests also require Missouri to remain absent from the current readiness wave and pin the October assessment to SHA-256 `d5146361e785d2bedaebcc73d6a1111e9a64c44be632ac7b43bb1723bdc53693`.

There is no runtime migration. Rollback is reverting these five standalone files together; there are no acquired source artifacts or production pointers to restore. A future evidence revision must use a new versioned reference and explicit review.
