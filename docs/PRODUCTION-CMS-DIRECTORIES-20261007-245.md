# Proposed retained-data production reconciliation — October 7, 2026

Plan 245 supersedes planning-only Plan 244 after retaining and independently verifying aggregate-only California CDSS childcare ZIP-format and address-completeness evidence. Production inputs and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-245`
- Plan confirmation SHA-256: `f7069e6562512a46e67d1e51dd0bca2663bd0a5ed6ed33403c4397f9bb1bb7a8`
- Plan file SHA-256: `9177a9f55c021b95c89e68a2a67e520e919ee319462e79cc3294e12e665cde1e`
- Predecessor plan: `production-cms-directories-20261007-244`

The bounded geography preflight performed four official aggregate SQL requests: lexical ZIP-format counts and address-field completeness counts for each childcare resource. No provider row, address value, ZIP value, or personal field was requested or returned. All aggregates conserve the source totals pinned by the schema and status preflights.

All 19,426 Child Care Center rows and all 19,758 Family Child Care Home rows contain a publisher-reported value matching five ASCII digits. No ZIP+4-shaped, blank, or other-shaped value was observed. Centers report 1,387 distinct ZIP strings and family homes report 1,188, but the strings themselves were not returned. Neither resource has blank address, city, state, or ZIP fields, and neither reports a non-California state value.

The immutable geography receipt is independently verified under manifest SHA-256 `ad1fc3ea20216081f02dc79db070e05fbe775407c0c8dad1cede5cdf32986093`. Five-digit lexical shape does not establish USPS validity, same-code Census ZCTA membership, population, or state assignment. Nonblank `facility_address` does not prove a physical operating site.

Publisher-status-to-active lifecycle governance, CSV delivery or paginated DataStore acquisition authorization, physical-versus-mailing address meaning, governed validation of reported ZIP5 values, suppression/redaction semantics, and the catalog/backend temporal disagreement remain unresolved. Current operation, statewide completeness, production admission, and current-pointer publication remain unclaimed or disabled.

Read-only production preflight returned `READY`, revalidated every production pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The four retained selections and `national-12g` profile remain pinned. Available disk was 73,918,435,328 bytes against a 13,309,329,011-byte requirement.

No production reconciliation, provider-row acquisition, production enrollment, credential operation, public export, or mutable source pointer write occurred. Plan 244 and earlier plans are superseded without execution. Any production execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261007-245 --expected-plan-sha256 f7069e6562512a46e67d1e51dd0bca2663bd0a5ed6ed33403c4397f9bb1bb7a8
```
