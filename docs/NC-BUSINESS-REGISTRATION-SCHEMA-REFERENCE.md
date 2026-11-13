# North Carolina Business Registration documentation prerequisite

The versioned `nc-business-registration-schema-reference-2026-11-13` reference remains **HOLD**. It adds a dated documentation review, with zero required source files, zero acquired records, no connector readiness and no acquisition authority. It is standalone and does not change the October assessment, connector registry, current readiness wave, application status, production pointers or coverage totals.

## Evidence and limits

The [official About the Data page](https://www.sosnc.gov/online_services/data_subscriptions/about_the_data) describes weekly CSV delivery and a dictionary on the FTP server. The [Business Registration page](https://www.sosnc.gov/divisions/business_registration) prohibits automated or scripted searches and directs bulk users to subscriptions. The [fee page](https://www.sosnc.gov/fees/by_title/_data_subscriptions?area=Divisions) lists a $750 setup fee and $2,000 per state fiscal year for Business Registration master files. These observations do not authorize a purchase or an automated request.

The [subscription manual](https://www.sosnc.gov/manual/assets/sos/pdf/data_subscriptions.pdf), labeled IT—March 19, 2024, was reported retrievable by the coordinating workstream: 1,733,984 bytes, SHA-256 `346c0b9fad925348ebd33e1c2bfbe4c9c20f2f24461158af088b5db7f9ff7857`. This receipt is attributed in the evidence; the loader verifies the local JSON, not the remote manual. No PDF is retained. The manual describes subscription access and does not prove current field compatibility.

The [historical layout](https://www.sosnc.gov/documents/forms/Data_Subcriptions/Business_Registration_layout.pdf) is indexed as an official document with changes through June 12, 2015. Its direct URL returned 404 in the coordinating review and was also unavailable to the web reader. Current linkage to that exact URL is not verified. Its historical Core snapshot, Names/Address join on EntityID, Legal NC name type and unique PitemID versus nonunique CorpNum are preserved only as dated review constraints. No current header set, executable schema, table inventory, parser or fixture is inferred.

Before implementation, obtain a current dictionary and person-free header proof, then verify identifier lifecycle, cardinality, status semantics, address roles, release completeness, corrections/deletions and subscription rights. Registry status does not prove operation; reservations are not establishments; registered-agent or personal addresses must not become operating-site evidence.

## Local verification

```powershell
node scripts/verify-nc-business-registration-schema-reference.mjs
node --test runner/nc-business-registration-schema-reference.test.mjs
npx eslint runner/nc-business-registration-schema-reference.mjs runner/nc-business-registration-schema-reference.test.mjs scripts/verify-nc-business-registration-schema-reference.mjs
```

The loader pins both exact file bytes and parsed content, rejecting altered fields, unknown fields, removed gates and widened authority. Verification reads only the versioned local JSON and writes no artifacts. It reports documentation-reference verification separately from schema compatibility and connector readiness. Tests also assert that NC is absent from the current connector-readiness wave.

This change has no runtime migration. Rollback consists of reverting the five standalone files together; there are no source-data artifacts or pointers to restore. A future evidence update must use a new versioned reference and explicit review rather than modifying this historical observation in place.
