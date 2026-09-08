# Maryland childcare normalized source candidates

Normalization consumes an independently verified acquired manifest without network requests. It produces immutable candidate records, quarantine references and a reconciled summary; it does not turn dated source records into independently verified operating businesses.

```powershell
node scripts/reprocess-md-childcare.mjs --acquired <absolute-acquisition-manifest>
node scripts/verify-md-childcare-normalized.mjs --manifest <absolute-normalized-manifest>
```

An optional absolute `--output` folder must remain inside datahub and outside retained job directories. Reprocessing creates a new UUID release without replacing or redownloading the acquired source. Verification independently replays acquired evidence and normalized rows, rather than trusting matching row counts or checksums alone.

## Postal, address and point boundaries

Source integer ZIP values from 1 through 99999 become five-character strings padded with leading zeros. Zero, negative, out-of-range and missing values produce null ZIP5 plus explicit reasons. This preserves a source representation, not proof of an assigned operational USPS ZIP. ZIP4 is a separate null field because the selected source does not provide it. Geocoder `PostalExt` is never used.

Reported names, DBA, addresses, state labels and license values retain source provenance. Missing fields remain candidate gaps; non-Maryland reported states remain unchanged and increment a separate state-conflict count. Country and premises role are not inferred from the publisher's jurisdiction. Repeated licenses are not merged.

Business geocodes contain nullable latitude and longitude only. Verified acquisition establishes that returned points were requested and declared in EPSG:4326. Missing points, out-of-range coordinates and zero-location anomalies become explicit gaps. Original point evidence is preserved under source provenance and in the acquired release, not presented as an entity polygon or verified address location. No county/ZCTA assignment is inferred.

The February 13, 2026 publisher cohort date, item modification time, layer edit clocks, page observation and processing time remain separate. `OBJECTID` identifies a row only within its source release; no cross-release identity or current-operation claim is made.

## Publication and conservation

Normalized records are capped below 65,536 bytes per line. Oversized records produce source-linked quarantine references so accepted plus quarantined rows still equal acquired membership; raw evidence stays in acquisition. Summary counts cover ZIP5/ZIP4/points, state conflicts and missing-field reasons. They describe the retained source cohort, not national completeness or unique-business counts.

The normalized manifest binds the exact acquisition path, hash, UUID and execution mode. UUID-scoped files are published manifest-last under `data/business-sources/md-childcare/normalized/jobs` by default. Ownership checks, before/after acquired replay, row-level output comparison and final file-identity checks protect retained evidence. Cancellation drains owned writes and cleans only incomplete owned output; uncertain publication remains inspectable. Prior datasets and source pointers are never replaced.

Rollback disables future normalization while preserving acquired and normalized evidence. App execution and its accepted-operation evidence are described separately in [the application handoff](MD-CHILDCARE-APP.md).
