# Maryland retained-cohort reporting

The local reporting adapter reads and independently verifies the completed Co*Tive app receipt and its acquired and normalized releases. It performs no source requests, promotion or identity matching. The installed enrollment pins the native receipt described in [the app outcome](MD-CHILDCARE-APP.md#verified-application-outcome--september-8-2026).

```powershell
node scripts/report-md-childcare.mjs
node scripts/report-md-childcare.mjs --receipt <absolute-app-receipt>
node scripts/report-state-access.mjs
```

The no-argument report uses `config/md-childcare-reporting-enrollment.json`. Missing enrollment is not-enrolled; a missing installed receipt is unavailable, not zero businesses. Malformed configuration, changed receipt hashes or dependency inconsistencies fail verification. Test or retained-reuse mode receipts can be reported explicitly but cannot qualify for the installed native binding.

## Units, scope and percentages

Counts describe source-candidate rows from the publisher's February 13, 2026 licensed Child Care Center cohort. Every reported-state and ZIP5 bucket, including null gaps, uses all accepted rows in this cohort as its denominator. No county or jurisdiction boundary is inferred from publisher scope or source coordinates. ZIP4 remains a separate, unavailable field.

Distinct license IDs and repeated license occurrences expose source repetition without merging businesses. Points are provider-transformed EPSG:4326 pairs, not independently verified business premises. National industry percentage, national completeness and unique active-business count remain null. Publisher cohort date, item modification, layer edit clocks and acquisition observation remain separate temporal facts.

The state-access ledger uses Maryland's `localSourceCandidateEvidence` for the MD childcare cell; Connecticut's existing projection is preserved for other cells, and Pennsylvania's separate `localFacilityEvidence` is unchanged. Local reporting does not replace published national coverage status, declare an app dispatch from configuration or start a schedule. Missing receipts do not manufacture measured zeroes.

## Preservation and rollback

All source data and prior releases remain unchanged. Report generation reuses retained evidence; it does not repull for promotion. To disable this local reporting enrollment, remove its config binding from use while preserving receipts and releases. This is internal reporting only, not public export authorization or national production integration.

## Installed evidence — September 8, 2026

The installed report returned available after full offline replay with network access disabled for that invocation. It describes 1,772 accepted candidates, no quarantine, 300 non-null ZIP5 groups plus one null ZIP bucket, 1,771 rows with ZIP5, no ZIP4 and 1,772 points. All reported states are MD, so MD is 100% of this particular cohort; national percentages remain unavailable. License IDs are distinct across these accepted records, without any identity-merging assertion.

State-access report `data/state-access/reports/20260908194510-93158f25-dc26-490a-af2a-fd3e7ccc8962.json` contains 51 jurisdictions and 459 industry cells. Maryland's local candidate evidence is verified-retained-cohort, while its published national status remains unsupported-evidence-not-measured. The existing CT 1,390-row candidate evidence and PA local facility evidence remain present. Published status counts are 202 national-data state-evidence cells, 8 direct-state-publisher cells, 57 unmeasured and 192 missing. These are industry cells, not business totals or completed state inventories.

## Verification

Seven reporting/enrollment test groups passed, covering synthetic source-state/ZIP gaps and percentages, repeated licenses, point anomalies, retained no-fetch reuse, cancellation, dependency tampering, missing-versus-zero distinctions, native receipt enrollment and rejection of a fully verified injected-mode receipt for native enrollment. All 25 state-ledger tests passed. Independent review found no concrete reporting blocker.

Full `npm run check` passed: 1,302 tests, 1,291 passed, 11 explicitly skipped, zero failures, plus lint, web/desktop builds and desktop control-plane smoke. Type checking passed and the production dependency audit reported zero vulnerabilities. All 82 pending production file pins remain unchanged. Log: `data/tmp/md-childcare-reporting-full-check.log`. No source acquisition, national promotion or schedule activation accompanied this reporting change.
