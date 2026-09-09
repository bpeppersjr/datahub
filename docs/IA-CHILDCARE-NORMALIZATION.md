# Iowa retained source-candidate normalization

This offline layer consumes the [verified selected acquisition](IA-CHILDCARE-ACQUISITION.md). It makes no source requests and preserves acquired inputs and previous derived releases.

Each record keeps its release-scoped original response ordinal and exact eight selected source values. Duplicate selected rows remain separate. Presentation name/address/city are trimmed with lineage; malformed control/surrogate text is quarantined by source ordinal and hash without raw error logging. Missing names and addresses remain explicit quality gaps.

Numeric ZIP values become five-character ZIP5 strings only when safe integers from 10000 through 99999. No padding, rounding or truncation occurs. ZIP4 is a separate null field because the source does not supply it. Syntactic ZIP validity does not prove current USPS assignment. Valid paired global-range coordinates are preserved as source-reported points with unknown CRS, address match and accuracy; missing or invalid pairs become null with a quality reason. Businesses receive no polygons. Address state/country/county remain null; `publisher_scope: IA` is not an inferred address assignment.

Map membership and referral do not establish present business operation. Source status, publisher update time and operating validity remain unknown. Observation time comes from the middle request, separately from processing time. Source response hash, release ID, original ordinal, selected-record hash, transformation version, policy pin and field lineage trace each record back to its acquired evidence. The normalized manifest binds the acquired manifest path, hash, run ID and execution mode.

Summary `source_records` means the selected center/preschool cohort. Accepted plus quarantined equals that number. `source_response_rows` separately counts the mixed response; excluded rows and duplicate counts are explicit. This prevents the home-provider response count from becoming a center-cohort denominator.

The acquired reader verifies and rereads the envelope before exposing it. The normalized writer publishes `normalized.jsonl`, `quarantine.jsonl`, `summary.json` and a manifest last. Independent verification replays all normalized and quarantined records against acquired evidence, checks exact hashes and file rosters, and detects same-size changes. Fixed limits, free-disk checks, ownership locks and cooperative cancellation govern local processing. Unknown/crash-left locks require inspection, not automatic theft or retry.

Standalone offline commands:

```powershell
node scripts/reprocess-ia-childcare.mjs --acquired "C:\Master Data\datahub\data\business-sources\ia-childcare\acquired\<release-id>\manifest.json"
node scripts/verify-ia-childcare-normalized.mjs --manifest "<absolute normalized manifest path inside datahub>"
```

These example paths are placeholders, not claims that an acquired release exists. The [app worker](IA-CHILDCARE-APP.md) owns native collection and can explicitly reuse a verified acquired manifest without downloading again. Internal source-candidate normalization does not authorize public export, identity matching or national promotion.

Release validation passed: `npm run check` reported 1,486 tests, 1,475 passed, 11 skipped and zero failures, with passing lint, desktop build and control-plane smoke. Type checking and the production dependency audit passed (zero vulnerabilities); all 82 held national production-plan pins remained unchanged. Log: `data/tmp/ia-app-full-check.log`. Focused tests include complete semantic replay, changed rows with forged checksums, offline CLI subprocesses and cancellation at manifest publication. These are synthetic/local proofs, not evidence of a native collection.

Rollback removes the isolated normalization layer while preserving acquired and derived releases for inspection; no existing production pointer is migrated.
