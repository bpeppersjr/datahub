# Alaska Corporations Download connector

This bounded connector targets the official Alaska Department of Commerce, Community, and Economic Development (DCCED), Division of Corporations, Business and Professional Licensing [`CorporationsDownload`](https://www.commerce.alaska.gov/cbp/main/DbDownload/CorporationsDownload) CSV.

It is deliberately not a production connector. Network preflight performs exactly one `HEAD` and one `GET` bounded to 81,616 response bytes, rejects redirects, and accepts only the exact HTTPS host and path, `text/csv`, `CorporationsDownload.csv` filename, declared-size guardrail, and pinned 35-column schema. The GET body is cancelled after the header is found. A returned network chunk may contain bytes from the first data row, so this is accurately described as a bounded-prefix read—not a header-only transfer. No data row is parsed or persisted, no source file is saved, and no normalized record or pointer is produced.

The observed 2026-09-03 `HEAD` response was `200 text/csv`, `Content-Disposition: CorporationsDownload.csv`, and `Content-Length: 44,309,498`. That size is evidence, not an immutable publisher guarantee; preflight records the current declared length and rejects values above 60,000,000 bytes.

## Pinned schema and acquisition gate

The exact source header is:

```text
CORPTYPE,ENTITYNUMBER,LEGALNAME,ASSUMEDNAME,STATUS,AKFORMEDDATE,DURATIONEXPIRATIONDATE,HOMESTATE,HOMECOUNTRY,NEXTBRDUEDATE,REGISTEREDAGENT,ENTITYMAILINGADDRESS1,ENTITYMAILINGADDRESS2,ENTITYMAILINGCITY,ENTITYMAILINGSTATEPROVINCE,ENTITYMAILINGZIP,ENTITYMAILINGCOUNTRY,ENTITYPHYSADDRESS1,ENTITYPHYSADDRESS2,ENTITYPHYSCITY,ENTITYPHYSSTATEPROVINCE,ENTITYPHYSZIP,ENTITYPHYSCOUNTRY,REGISTEREDMAILADDRESS1,REGISTEREDMAILADDRESS2,REGISTEREDMAILCITY,REGISTEREDMAILSTATEPROVINCE,REGISTEREDMAILZIP,REGISTEREDMAILCOUNTRY,REGISTEREDPHYSADDRESS1,REGISTEREDPHYSADDRESS2,REGISTEREDPHYSCITY,REGISTEREDPHYSSTATEPROVINCE,REGISTEREDPHYSZIP,REGISTEREDPHYSCOUNTRY
```

The fingerprint is SHA-256 `356d519c62dea68287b028721822cb7f487b7fc0074c55878942f99f803b54d1`, calculated over the ordered names separated by NUL.

The roughly 44 MB live acquisition is default-denied, requires the exact acknowledgement constant even to cross the gate, and remains intentionally unimplemented. Crossing the gate still throws before any network request. A future implementation requires separate source-rights, privacy, automation, retention, and production review.

## Offline local-review build

`buildAkCorporationsOffline` accepts only an operator-supplied CSV inside the governed workspace after both:

- exact acknowledgement `I-APPROVE-AK-CORPORATIONS-OFFLINE-LOCAL-REVIEW-BUILD`; and
- an explicit expected SHA-256 matching the file before processing.

The build pins the full transport schema, rejects duplicate `ENTITYNUMBER` values, re-hashes the source after streaming, writes only privacy-selected JSONL in a run-scoped staging directory, independently verifies artifact hashes and record reconciliation, and atomically moves the result into a checksum-verified, non-overwriting release directory. Filesystem immutability is not asserted. It never writes `current.json` or another pointer, and failed or cancelled staging runs are removed.

Focused verification:

```powershell
node --test runner/ak-corporations.test.mjs
```

## Legal-entity, privacy, and semantic boundary

`ENTITYNUMBER` is preserved as the candidate source identifier. The allowlist admits only named legal-entity types. `Business Name Registration` and `Foreign Corporate Name Registration` are excluded as aliases, and unknown corporation types remain excluded until reviewed.

The selected record preserves `CORPTYPE`, `LEGALNAME`, `ASSUMEDNAME`, exact `STATUS`, Alaska formation/duration/biennial dates, home jurisdiction, and entity mailing and physical administrative addresses. U.S. postal values are split into ZIP5 and ZIP+4; the normalized `postal_code` alias is ZIP5 only.

`REGISTEREDAGENT` and every `REGISTEREDMAIL*` and `REGISTEREDPHYS*` field are discarded before persistence. Owner, officer, manager, member, principal, signer, and other person fields are not admitted. Legal names and entity addresses may nevertheless identify people or residences, so normalized records remain local-review-only.

Both entity mailing and entity physical addresses are administrative registry evidence. This connector creates organizations only: no site, establishment, geometry, geocode, owner, affiliation, current-operation, good-standing, or storefront inference is permitted.

## Governance

The policy references Alaska's [Public Records Act](https://www.akleg.gov/basis/statutes.asp#40.25.100) and DCCED's [website terms](https://www.commerce.alaska.gov/web/TermsofUsePolicy.aspx), preserves State of Alaska ownership and attribution, and does not claim an open-data license. Raw or derived publication and redistribution remain unapproved.

All records and releases are barred from production datasets, the national business registry and coverage views, completeness counts, and Heatmap Builder until an explicit governance decision changes those boundaries.
