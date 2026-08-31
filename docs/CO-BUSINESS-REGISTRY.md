# Colorado Business Registry Good Standing or Delinquent organizations

This source layer publishes a governed snapshot of records whose `entitystatus` is exactly `Good Standing` or `Delinquent` in the official Business Entities in Colorado dataset (`4ykn-tg5h`).

## Authority and meaning

The Colorado Department of State (CDOS) provides the dataset through the Colorado Information Marketplace, whose catalog marks it Public Domain. Colorado Secretary-of-State guidance says Good Standing means the entity filed required periodic reports and maintained required information. Delinquent means a filing, fee, periodic-report, registered-agent, or related registry obligation was not cured. Colorado law also says a domestic entity's existence continues notwithstanding delinquency.

Co*Tive Collector preserves the two status values separately. Neither is translated into proof of current operations, legality, reputation, solvency, licensure, public access, or an open storefront. A Delinquent record is not translated into a claim that the organization ceased to exist or operate.

## Governed acquisition

The connector:

1. retrieves official catalog metadata and requires the expected dataset ID, title, CDOS attribution, Public Domain license, and pinned selected-field schema;
2. preflights the exact combined Good Standing and Delinquent count;
3. requests only 12 approved fields using strictly increasing numeric entity-ID keyset pagination;
4. rejects redirects, non-allowlisted hosts and paths, oversized pages, out-of-order IDs, unexpected statuses, schema drift, and duplicate source identity;
5. rechecks the catalog refresh timestamp and selected-status count after acquisition and aborts publication if the source changed;
6. hashes the complete selected-field source snapshot before normalization;
7. writes run-scoped immutable artifacts and changes `current.json` only after all quality gates pass.

The current source release identity is bound to the catalog `rowsUpdatedAt` timestamp and SHA-256 checksum of the complete ordered source artifact.

## Field boundary

Approved normalized fields are the Colorado entity ID, registered entity name, entity status, entity type, formation jurisdiction, formation date, and principal-office street address.

The connector deliberately excludes:

- principal-office mailing addresses;
- every registered-agent name and organization name;
- every registered-agent principal and mailing address.

The source entity ID is the provisional organization identity. The principal-office address may be administrative, residential, virtual, incomplete, stale, out of state, or outside the United States. It creates no physical site or establishment.

## Coverage and gaps

Every selected source row becomes an organization candidate. A row contributes to ZIP coverage only when it has a street, city, supported U.S. state or territory code, a valid ZIP5 or ZIP+4, and no explicitly non-U.S. country value. ZIP allocation is an organization-address observation, not a site count.

Current USPS operational validity remains `unverified` until an authorized USPS denominator is integrated.

## Current verified release

Release `co-business-registry-20260831-011711242Z-0c64c71c` is bound to source refresh `2026-08-30T11:20:54.000Z` and source release `co-business-registry-2026-08-30-4b31a3417508bffe`. Independent verification rehashed and parsed all 21 artifacts totaling 323,170,400 bytes.

The selected source snapshot contains 2,169,063 rows: 1,037,452 Good Standing and 1,131,611 Delinquent. One Delinquent row has a valid entity ID but no entity name, so it is preserved in an internal quarantine artifact with reason `missing-or-invalid-organization-identity`. The release publishes 2,169,062 organizations: 1,037,452 Good Standing and 1,131,610 Delinquent.

Exactly 2,154,593 published organizations have an eligible reported U.S. principal-office address across 18,130 ZIPs; 14,469 have no eligible U.S. ZIP allocation. Physical-site and establishment counts remain `null` because neither is inferred.

## Operations

Build and independently verify the release:

```powershell
npm run co-business:build
npm run co-business:verify
```

If Windows temporarily holds a staging-directory handle after every artifact and the manifest have been completed, the same immutable run can be independently verified and published without reacquiring the source:

```powershell
npm run co-business:build -- --resume-staging-run <run-uuid>
```

If acquisition completed but normalization stopped on a newly observed source-quality exception, revalidate the complete staged source snapshot and normalize it into a new run without downloading it again:

```powershell
npm run co-business:build -- --resume-source-staging-run <run-uuid>
```

Outputs remain under `data/business-sources/co-business-registry-good-standing-or-delinquent-organizations`. Raw selected-field source snapshots are internal; approved normalized records are public with attribution, provenance, refresh timestamp, and the semantic limitations above.
