# Maryland childcare prerequisites

The standalone metadata/count preflight targets only the literal `Provider_Type='Child Care Center'` subset of Maryland's public licensed-provider layer. Its publisher cohort date is February 13, 2026, not the service name's May 2024 date, a later edit timestamp, or a claim of current operation.

```powershell
node scripts/preflight-md-childcare.mjs
```

The fixed six-request sequence checks item metadata, selected layer schema and center count twice. Requests are serial, paced by at least one second, capped at two million decoded bytes each and 30 seconds each, with a 120-second whole-operation deadline. No retries, redirects, credentials, facility rows, ID inventories or business geometry are requested. Provider errors or changes stop readiness.

The source contract pins identity, exact metadata notices, publisher description and nine selected fields. Full item metadata is retained unchanged; the selected layer projection is identified as such. Unknown fields in the item envelope and unexpected facility data are rejected before receipt publication. ZIP5 derives from the source integer only in a future normalization stage; ZIP4 must remain separate and cannot be filled from geocoder `PostalExt`. No latitude/longitude is collected at this stage.

Receipts are immutable and UUID-scoped under `data/business-sources/md-childcare/preflights`. Validation replays the semantic contract and paired observations; checksums alone are not proof that a forged payload is valid. Native and injected-test modes remain distinguishable, while recorded native mode is not independent network attestation. No source pointer, app enrollment or national reporting pointer is replaced.

The item notice permits distribution while retaining metadata unchanged and acknowledging the State of Maryland in derived metadata. See [public-use evidence and remaining uncertainty](states/MD-CHILDCARE-TRIAGE-2026-09-08.md#public-use-context-and-preflight-contract-decision). This preflight is not a facility exporter or a legal opinion. Its acquisition-not-ready status records missing implementation, not an invented account requirement.

Next is bounded source-candidate acquisition with reconciled membership, durable journals and retained-release replay, then normalization and an app-owned collection handoff. Agents should return to connector work once Co*Tive records an accepted operation; routine downloads must not consume an agent slot.

Rollback removes this preflight's future use without deleting immutable evidence. Existing state datasets and national production pins remain untouched.

## Verified native prerequisite — September 8, 2026

Native preflight `c0154770-2fbc-4fdf-92c4-fdee52e61824` ran from `2026-09-08T18:50:37.930Z` to `2026-09-08T18:50:44.135Z`. All six requests succeeded, consuming 53,330 decoded response bytes. Both center-count observations returned 1,772. Paired item/schema/edit metadata remained stable under the documented exclusion of view counters from comparison; those counters remain present in unchanged item observations.

The immutable receipt is `data/business-sources/md-childcare/preflights/c0154770-2fbc-4fdf-92c4-fdee52e61824.json`, 12,929 bytes, SHA-256 `aed115a076f53ae9c04dca57cbbd81a41940b64c6b2840f70a5555cfcc815914`. A separate offline read revalidated the full semantic receipt and hash without an additional provider request.

The source item modified time is `2026-05-27T19:48:49.000Z`; the publisher cohort remains February 13, 2026. The count is a source cohort size, not unique operating businesses or nationwide completeness. No facility acquisition, managed job, schedule or national promotion was performed.

Six focused test groups passed with synthetic transport. Coverage includes exact scope/notice retention, immutable publications, schema/privacy/protocol changes, count drift, noncooperative cancellation, rehashed receipt forgeries, future edit clocks and imported-configuration mutation. The reviewer findings about unexpected row payloads and unbounded edit dates were repaired before native execution.

The complete `npm run check` passed after updating two stale registry inventory assertions: 1,270 tests, 1,259 passed, 11 explicitly skipped and zero failed, followed by lint, builds and desktop smoke. The inventory is now 60 connectors and 51 source-policy profiles; a focused assertion confirms Maryland remains metadata-only. Type checking passed and the production dependency audit reported zero vulnerabilities. All 82 pending national production pins remained unchanged. Final log: `data/tmp/md-childcare-preflight-full-check-2.log`; the earlier inventory-failure log is retained separately.

## Acquisition handoff requirements

Use a separate row-acquisition policy and connector, preserving this metadata-only profile. Retain the initial preflight before baseline ID inventory. Reconcile sorted unique `OBJECTID` membership with the center count, fetch bounded ID batches with the exact selected attributes, and verify each observation before requesting the next batch. Request points in `outSR=4326` and validate the returned reference; missing points remain null, and no polygon belongs on a business entity. Repeat membership and preflight checks before publishing.

The immutable acquired-release layer must provide journaled prerequisites/pages, cumulative resource budgets, cancellation, manifest-last publication and full offline replay. Normalization must retain missing address/name/license gaps and separate ZIP fields rather than silently dropping members. App enrollment follows verified acquisition and normalization; the accepted app operation and persisted receipt—not an agent shell—complete the eventual download handoff.
