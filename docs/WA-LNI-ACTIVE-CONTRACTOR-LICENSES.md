# Washington L&I active-contractor organizations

This source layer publishes one provisional organization per nine-digit UBI represented by a row whose `statuscode` is exactly `A` and `contractorlicensestatus` is exactly `ACTIVE` in the official **L&I Contractor License Data - General** dataset (`m8qx-ubtq`).

## Authority and meaning

The Washington State Department of Labor & Industries publishes the dataset through Data.WA.gov. The catalog marks it official, published, and licensed under PDDL. `ACTIVE` is preserved as contractor-license status. It is not translated into proof of continuous operation, current compliance, public access, an open storefront, or a current worksite.

## Governed acquisition

The connector:

1. requires the exact official dataset identity, title, L&I attribution, PDDL license ID, publication metadata, and pinned selected-field schema;
2. preflights the exact A/ACTIVE row count;
3. requests only 21 approved fields in UBI and contractor-license-number order;
4. rejects redirects, non-allowlisted hosts and paths, oversized pages, invalid or out-of-order keys, unexpected statuses, schema drift, refresh drift, and count mismatch;
5. rechecks source refresh time and row count before publication;
6. hashes the complete selected-field source snapshot before grouping; and
7. changes `current.json` only after immutable run-scoped artifacts pass independent verification.

## Identity, privacy, and field boundary

All active licenses sharing a UBI form one provisional organization. The source models UBI as a number, so eight-digit values are deterministically left-padded to the canonical nine-digit representation. Multiple source-reported business names, contractor license numbers, business/license types, specialties, dates, and distinct mailing addresses are retained as evidence. A deterministic display name is selected for display only; no name is asserted to be a verified legal name.

The connector never requests `phonenumber` or `primaryprincipalname`, and both fields are forbidden in staged and normalized records. Selected source rows are internal. Normalized record-level artifacts are local-review-only because names can identify natural persons and mailing addresses can be residences. PDDL aggregate counts can be redistributed with L&I attribution and the semantic limitations retained.

## Coverage and gaps

The source explicitly describes its address as a mailing address. A distinct address contributes to ZIP coverage only when it includes street, city, a supported U.S. state or territory code, and valid ZIP5 or ZIP+4 syntax. It never creates a physical site, storefront, establishment, or contractor worksite.

This is a state contractor-license dataset, not a census of all businesses or all contractors in Washington or the United States. Current USPS operational ZIP validity remains `unverified` until an authorized USPS denominator is integrated.

## Current verified release

Release `wa-lni-active-contractor-licenses-20260901-232717159Z-3cfc4905` is bound to source refresh `2026-09-01T19:35:41Z` and source release `wa-lni-active-contractor-licenses-2026-09-01-3584fe6581bbcd4a`. Independent verification rehashed and parsed all 21 artifacts totaling 62,165,677 bytes.

The complete selected snapshot contains 75,796 active contractor-license rows grouped into 72,783 UBI organizations and 75,796 license activities. Of these, 2,590 organizations have more than one active license. The release retains 73,722 distinct-within-organization source-reported business-name observations and 74,116 distinct-within-organization mailing-address observations.

Exactly 74,005 mailing-address observations are eligible for ZIP allocation across 3,138 source ZIPs; 105 organizations have no eligible U.S. mailing-address ZIP. No group was quarantined. Physical-site and establishment counts remain `null`.

## Operations

Build and independently verify:

```powershell
npm run wa-lni-contractors:build
npm run wa-lni-contractors:verify
```

Resume a complete unpublished run or reprocess its selected-field source snapshot:

```powershell
npm run wa-lni-contractors:build -- --resume-staging-run <run-uuid>
npm run wa-lni-contractors:build -- --resume-source-staging-run <run-uuid>
```

Outputs remain under `data/business-sources/wa-lni-active-contractor-organizations`.
