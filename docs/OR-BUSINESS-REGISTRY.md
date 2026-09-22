# Oregon Business Registry active registrations

This source layer publishes a governed snapshot of registrations represented by `PRINCIPAL PLACE OF BUSINESS` rows in the official Oregon **Active Businesses - ALL** dataset (`tckn-sxa6`).

## Authority and meaning

The Oregon Secretary of State Corporation Division publishes active business-registration records through Oregon's Open Data Portal. Oregon's Open Data Program defines open data as data that can be freely used, modified, and shared by anyone for any purpose at no direct cost.

`Active` remains Oregon source-registration evidence. Most entity types renew annually and assumed business names renew every two years. The status is not translated into proof of current operations, legality, solvency, licensure, public access, or an open storefront. Oregon also explains that sole proprietors and general partnerships do not have to register unless they use an assumed business name, so the dataset cannot be treated as every business operating in Oregon.

## Identity boundary

One Oregon registry number becomes one normalized registration record:

- entity types other than `ASSUMED BUSINESS NAME` create a provisional organization candidate;
- an `ASSUMED BUSINESS NAME` creates a provisional brand candidate, not a legal organization; and
- no owner, legal organization behind an assumed name, parent company, physical site, establishment, or relationship is inferred.

The live source currently contains a small number of registry numbers with two principal-place rows. They remain one registration with multiple source-row-address observations. ZIP coverage counts each registration at most once per ZIP while preserving every selected source row and its Socrata row identity.

## Governed acquisition

The connector:

1. retrieves official catalog metadata and requires the expected dataset ID, title, description, null catalog-license field, and pinned selected-field schema;
2. preflights both the principal-place source-row count and distinct registry-number count;
3. requests only the Socrata row ID plus 11 approved business/registration/address fields using compound registry-number and row-ID keyset pagination;
4. rejects redirects, non-allowlisted hosts and paths, oversized pages, decreasing registry-number order, duplicate row IDs, non-principal-place rows, schema drift, and inconsistent identity fields within one registration; Socrata's opaque row-ID collation is left to the API rather than reinterpreted as JavaScript string order;
5. rechecks catalog refresh and both counts after acquisition and aborts publication if the source changed;
6. hashes the complete selected-field source snapshot before normalization; and
7. writes run-scoped immutable artifacts and changes `current.json` only after independent verification.

## Field boundary

Approved fields are the Socrata row ID, registry number, business name, entity type, registry date, constant associated-name type, principal-place street/city/state/ZIP, and jurisdiction.

The connector excludes:

- first, middle, last, and suffix fields;
- entity-of-record names and registry numbers;
- every mailing-address row;
- every registered-agent row;
- every authorized-representative row; and
- the business-details URL.

Principal-place addresses can be administrative, residential, virtual, incomplete, stale, outside Oregon, or outside the United States. They are organization/brand evidence only and create no physical site or establishment.

## Operations

Build and independently verify the release:

```powershell
npm run or-business:build
npm run or-business:verify
```

A complete staged source snapshot can be revalidated and normalized into a new run without downloading it again. A completed unpublished staging run can be independently verified and published by run ID. All outputs remain under `data/business-sources/or-business-registry-active-registrations`.

## Validated live release

Release `or-business-registry-20260903-004514399Z-1d3068a7` is the retained release selected by `current.json`. It is bound to the source refresh at `2026-09-01T13:44:15.000Z` and source release `or-business-registry-2026-09-01-c58ca37fef13c0e9`. Independent verification rehashed and parsed all 21 artifacts totaling 136,439,619 bytes.

The snapshot contains 559,882 principal-place rows for 559,874 registrations. It publishes 443,445 legal-entity registrations and 116,429 assumed-business-name registrations; no registration group was quarantined. Eight registrations retain two principal-place rows. Exactly 559,522 registrations have at least one eligible U.S. principal-place ZIP, producing 559,523 distinct registration/ZIP contributions across 9,184 source ZIPs; 352 registrations remain published without an eligible U.S. ZIP allocation. Physical-site and establishment counts remain `null`.

## Refresh readiness in Co*Tive Collector

The Data Operations page provides a deterministic, read-only Oregon refresh preview. It revalidates the policy, connector, dataset assessment, actual `current.json` pointer, and retained manifest. The manifest is authoritative for retained counts; the dataset catalog still describes the older August 31 release and is reported as not matching rather than silently treated as current.

The assessment records a metadata-date conflict, so portal observations are not treated as proof of a newer record release. A future refresh requires a governed transport and metadata preflight, full-snapshot comparison that does not reinterpret row loss as closure, preserved legal-entity versus assumed-name semantics, and separate authorization for acquisition and any production-pointer change. Until then, Start remains disabled and a direct start request returns `ACQUISITION_NOT_AUTHORIZED` before an operation, executor, receipt writer, or network request can be created.
