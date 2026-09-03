# Florida Business Registry quarterly active entities

This source layer publishes a governed, privacy-minimized snapshot of entities in the Florida Department of State Division of Corporations quarterly corporate archive.

## Authority and meaning

The Division offers free data downloads for informational purposes and explicitly documents custom-program and database use. Quarterly archives are generated in January, April, July, and October. The corporate archive covers corporations, limited liability companies, and limited partnerships; it does not cover trademarks or every business operating in Florida.

The corporate file definition assigns `A` to active and `I` to inactive. Although the general downloads page describes quarterly files as active data, the live July 2026 corporate archive contains both codes. The connector therefore retains an internal privacy-minimized all-status source snapshot, publishes only explicit `A` rows, and records `I` rows in a separate internal exclusion artifact. The normalized active status remains source evidence only. It is not proof of current operations, legality, solvency, licensure, public access, or an open storefront.

## Privacy and identity boundary

One six- or twelve-character corporate document number creates one provisional organization candidate. The reported principal address remains an organization assertion. It creates no physical site, establishment, owner, parent, registered-agent, officer, or other relationship.

The official 1,440-character source row also includes an FEIN, mailing address, registered-agent details, and up to six officer names and addresses. The connector never materializes those fields in a retained artifact. It extracts only the approved identity, filing, principal-address, jurisdiction, and report-date positions, then deletes the unminimized archive. Rows that violate the documented six-or-twelve-character document-number contract remain internal and are quarantined by deterministic source-row ordinal; they cannot create organizations or ZIP evidence.

## Governed acquisition

The connector is restricted to `sftp.floridados.gov` and `/Public/doc/quarterly/cor/cordata.zip`, with the observed ED25519 host key pinned. It requires the publisher's public password through `FL_SUNBIZ_PUBLIC_PASSWORD`; credentials are never stored in the repository, fixtures, logs, manifests, or release artifacts.

An existing published release can also supply its retained privacy-minimized selected-field snapshot. This offline path verifies the release pointer and identity, path containment (including resolved links), the exact three-artifact source inventory, every source artifact's byte count and SHA-256, the acquisition metadata, the pinned layout, and the derived source-release identity before rebuilding. Historical normalized artifacts are neither trusted nor modified. The new release records the source manifest and selected-snapshot hashes as replay lineage.

Before publication it:

1. records and later rechecks the remote archive size and modified time;
2. caps the archive at 3 GB and downloads one stream at a time with safe resume semantics;
3. verifies ZIP structure and accepts only the ten documented corporate filing members;
4. validates every source row at exactly 1,440 characters and rejects duplicate document numbers;
5. retains and hashes only approved selected-field JSON records, separating explicit `I` rows from active publication;
6. independently replays normalized records and reconciles ZIP counts; and
7. updates `current.json` only after immutable release verification.

The current official archive observed on August 31, 2026 was modified July 10, 2026 and is 1,819,049,954 compressed bytes.

## Address and ZIP limitations

Principal addresses may be residential, administrative, virtual, stale, incomplete, outside Florida, or outside the United States. Florida records can leave the state and country positions blank even when a syntactically valid ZIP is present. The connector preserves those blanks and permits ZIP coverage only when the address has street, city, and a valid five-digit ZIP and does not explicitly identify a non-U.S. country. Current USPS ZIP validity remains unverified until the governed operational ZIP denominator is available.

## Operations

Build and independently verify a release:

```powershell
$env:FL_SUNBIZ_PUBLIC_PASSWORD = '<password shown on the official Florida Data Downloads page>'
npm run fl-business:build
npm run fl-business:verify
Remove-Item Env:FL_SUNBIZ_PUBLIC_PASSWORD
```

All artifacts remain under `data/business-sources/fl-business-registry-quarterly-active-entities`. The download is large; allow several gigabytes of temporary disk space plus time for fixed-width parsing and replay verification.

Rebuild from a verified published selected-source snapshot without a network request or credential:

```powershell
npm run fl-business:build -- --source-release "data/business-sources/fl-business-registry-quarterly-active-entities/current.json"
npm run fl-business:verify
```

Use `--output` to direct a migration rebuild to an isolated candidate root. Source-release, archive, staged-source resume, and staged-publication resume modes are mutually exclusive.

## Validated live release

Release `fl-business-registry-20260831-113438057Z-1c650938` is bound to the July 10 archive, SHA-256 `ddaa7c4d8f9e217dfe73f05a35f81e0842e47a365d34dc709dcede868f798a56`, and source release `fl-business-registry-2026-07-10-392c89e9e5b94cb6`. Independent verification rehashed and replayed all 23 artifacts totaling 1,396,232,386 bytes.

That immutable release was normalized by connector 1.0.0. Connector 1.0.1 intentionally emits corrected separate ZIP5 and ZIP+4 fields, so replaying its source against the old derived partitions will not match. The governed source-release mode verifies and reuses only the retained selected-source layer to create a new 1.0.1 release; it does not treat the old derived data as current.

The archive contains 12,808,196 rows across `cordata0.txt` through `cordata9.txt` and expands to 18,469,418,632 bytes. Of those rows, 4,109,232 carry source code `A` and 8,698,964 carry source code `I`. The release publishes 4,109,230 active organizations; two active rows are quarantined for invalid annual-report-year values. Exactly 3,928,280 published organizations have an eligible reported U.S. principal-address ZIP, spanning 19,064 source ZIPs. Another 180,950 published organizations remain available without a ZIP allocation. Physical-site and establishment counts remain `null`.
