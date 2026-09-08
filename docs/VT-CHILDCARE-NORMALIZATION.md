# Vermont source-candidate normalization

Normalization operates offline on an independently verified [acquired release](VT-CHILDCARE-ACQUISITION.md). It does not repull data, assign business polygons, infer an address state or convert the publisher's deliberately jittered points into address geocodes.

Each candidate preserves its selected raw source fields and carries a collision-safe release-scoped identifier derived from the ordered pair `file_name,license_id`. The source license remains a typed external identifier, not a canonical business identity or a deduplication instruction. Provenance binds source release, ingest run, source update, individual page observation, processing time, transformation version, input hash and internal ODbL policy.

Canonical ZIP5 and ZIP4 are separate. Five-digit, nine-digit and hyphenated source postal text is parsed without claiming current USPS assignment; missing, malformed and placeholder values remain explicit gaps. Original source text stays in retained provenance. Missing names or address fields do not silently remove candidates. Oversized normalized records become redacted quarantine references back to the acquired evidence, and accepted plus quarantined counts must equal the source count.

Reported state and country remain null because they are not selected source fields. `publisher_scope: VT` is jurisdiction, not a premises assignment. County is an unverified source label. Address role remains unspecified; PO-box-like labels are flagged without guessing a physical site. Latitude and longitude remain null, with coordinate-unavailability reasons.

Both license-date strings are preserved as floating calendar values when valid, otherwise with missing/invalid reasons. No UTC offset, current-operation date or exact reporting period is inferred. The raw reporting filename remains separate from `reporting_period: null`. Five capacity fields preserve raw values and parse only nonnegative safe integer text; these are theoretical licensed capacities, not attendance, employment or business units. Per-field date/capacity gaps are counted.

## Immutable offline workflow

```powershell
node scripts/reprocess-vt-childcare.mjs --acquired <absolute-acquisition-manifest>
node scripts/verify-vt-childcare-normalized.mjs --manifest <absolute-normalized-manifest>
```

Output stays within datahub under UUID jobs and includes `normalized.jsonl`, `quarantine.jsonl`, `summary.json` and a manifest published last after replay. Verification reconstructs normalized values and gaps from the bound acquired input, checks file contents and identities, and rejects altered or borrowed artifacts. Earlier acquisitions and normalized releases are not overwritten. Ordinary failure evidence and uncertain committed outputs remain available for inspection; cancellation removes only owned incomplete output.

Outputs remain internal source candidates. They do not establish unique active businesses, verified premises, exact address geocodes, geographic boundary membership or national completeness. Public redistribution requires separate ODbL compatibility assessment. The [app workflow](VT-CHILDCARE-APP.md) owns native collection and can explicitly reuse retained acquisition without a new source request.
