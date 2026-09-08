# Vermont retained publisher-cohort reporting

The local reporting adapter consumes the verified Co*Tive app receipt and retained acquisition/normalization manifests. It does not download, geocode, deduplicate or promote source records into national production. Use the standalone CLI with its pinned installed enrollment, or explicitly select an app receipt for offline inspection:

```powershell
node scripts/report-vt-childcare.mjs
node scripts/report-vt-childcare.mjs --receipt 'C:\Master Data\datahub\data\industry-segments\runs\52b06724-fa4e-4873-9388-27c1a5f1424d\state-vt-childcare-centers-VT\jobs\4f721905-454e-4f16-b11f-98594d035640\receipt.json'
node scripts/report-state-access.mjs
```

Enrollment accepts the pinned native app receipt only after independent offline verification. Explicit receipt inspection can summarize synthetic or retained-reprocessing evidence without enrolling it as native collection. Missing enrollment and a missing installed receipt are distinct from measured zero; an incomplete child chain or invalid evidence fails closed without a network fallback.

## Geography and denominators

Vermont is the publisher's jurisdiction, not a substituted address-state value. The state ledger adds `localPublisherCohortEvidence` only to the VT childcare cell. The existing published coverage status, app-dispatch observations, identity-matching totals and national percentages are unchanged. Other states do not inherit this cohort.

The summary conserves the null reported-state bucket and groups reported ZIP5 values separately from ZIP4 availability. Distinct ZIP5 values are not a polygon-assignment count or proof of USPS validity. Percentages describe accepted source-candidate rows within this retained cohort, never all United States businesses or industry completeness. National completeness and unique active-business counts remain unknown.

Preserve the raw reporting filename and publisher clocks, with unknown reporting period. Provider license dates do not establish current business operations. Publisher coordinates were deliberately omitted because they were jittered, and exact address geocodes remain missing. County labels remain source labels, not inferred county assignments. Public export is not authorized by this reporting feature.

## Recovery and rollback

Keep the app and child manifests with their original run-scoped artifacts. Reuse this retained chain for downstream work; do not recollect merely to repair reporting. If enrollment fails verification, inspect the retained chain rather than replacing hashes to accept changed evidence. Removing the Vermont reporting enrollment config disables local enrollment without deleting acquired data or changing national production pins. Reintroduce only an independently verified binding.

See [verified collection evidence](VT-CHILDCARE-APP.md#verified-retained-completion--september-8-2026) for the native receipt and manifest hashes. Implementation acceptance includes null-state conservation, separate ZIP4 values, cancellation, changed evidence, injected-receipt enrollment rejection, and unchanged national coverage totals.

## Local integration evidence — September 8, 2026

The installed CLI returned available native evidence with 503 accepted rows and zero quarantine. A state-access report built with network calls explicitly disabled was retained at `data/state-access/reports/20260908212020-9ad46c20-2051-4a45-b292-20c1511bafa0.json`. Assertions confirmed only VT receives the publisher-cohort field: 503 rows, 172 distinct reported ZIP5 values, two ZIP4 values, 503 missing address states, no points and null national industry percentage. Maryland's 1,772 and Connecticut's 1,390 local candidate rows were preserved. The ledger remains 51 jurisdictions and 459 industry cells, with 202 national-state-evidence cells, eight direct-state-publisher cells, 58 unmeasured cells and 191 missing cells. These cell counts are not business counts or completeness percentages.

Verification passed: 27 state-ledger tests, two reporting test groups, five enrollment groups and one CLI group. The reporting fixture conserves four selected rows as three accepted plus one oversized-record quarantine; modified normalized data is rejected even after rehashing manifest, checkpoint and receipt bindings. The installed native enrollment was replayed offline, while fully verified synthetic evidence was rejected for native enrollment. Independent review found no concrete blockers.

Full `npm run check` passed with 1,341 tests: 1,330 passed, 11 skipped and zero failed; lint, web/desktop builds and desktop control-plane smoke also passed. Log: `data/tmp/vt-reporting-full-check.log`. Type checking passed and the production dependency audit found zero vulnerabilities. All 82 pending production pins were unchanged. Both managed and generic app queues were observed empty before the development service was temporarily stopped for desktop smoke, then restored. No acquisition or production launch was submitted by this integration.
