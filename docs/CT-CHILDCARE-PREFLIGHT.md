# Connecticut childcare preflight

The OEC [Child Care & Youth Camp Licensing Program Data](https://data.ct.gov/api/views/h8mr-dn95.json) is a daily-updated public state dataset. Its metadata identifies Office of Early Childhood ownership, DAS/BEST - eLicensing attribution, a Public Domain license and street-address geography. It is distinct from Connecticut's Secretary-of-the-State business registry; existing registry data is not downloaded again.

The preflight uses only the fixed catalog endpoint and [Socrata resource](https://data.ct.gov/resource/h8mr-dn95.json) with `licensetype='Child Care Center' AND status='ACTIVE'`. It excludes other license classes; ACTIVE remains a source credential status, not proof of a currently operating unique business.

## Bounded application prerequisite

```powershell
node scripts/preflight-ct-childcare.mjs
```

Four serial requests check metadata, aggregate counts, aggregate counts and metadata again. The contract caps each response at 2 MB and each header/body request at 30 seconds, with one-second minimum request spacing and a cooperative 120-second whole-job deadline. There are no redirects, credentials, automatic retries or provider fallbacks. Provider errors and schema/count drift fail finitely before any facility acquisition.

Only selected field names/types, catalog identity/license/update facts and bounded aggregates are retained. Raw catalog cached values can contain contact/person samples and are discarded before persistence. A completed validated receipt is published under an immutable UUID; no source, app enrollment, current dataset or national pointer is replaced.

## Known source facts and downstream gates

The source-discovery aggregate observed 1,390 active-center rows, 1,390 distinct `uniquekey` values and only 1,364 distinct `credentialidnt` values. The contract requires unique source keys but permits repeated credentials; a credential number must not collapse rows or imply one physical site. One row lacked `address2` and all rows had a nonnull source ZIP value. Availability does not validate postal formatting, current USPS assignment or premises accuracy.

Selected fields cover source key/credential/license/name/type/status, non-mailing address fields, credential dates and capacity attributes. Contact identifiers, attention fields, phone/fax, mailing addresses, director, teacher and consultant information are excluded from retention. Future facility processing must preserve ZIP5 and ZIP4 separately, and keep coordinates null unless a separate geocoding source supplies them with provenance.

This is a metadata/count-only policy and implementation. A successful receipt does not approve record-level acquisition, address semantics, identity matching, public export, national reporting or scheduling. Before a dependent facility connector is enrolled, resolve address/key semantics, test ordered membership/page reconciliation, implement normalization and privacy limits, and complete an app-owned operation/receipt handoff. Retain source version and observation timestamps separately; daily refresh cadence does not imply real-time operations.

## Native validation evidence — September 8, 2026

The tested four-request preflight completed from `2026-09-08T17:44:01.608Z` to `2026-09-08T17:44:06.831Z`. Both aggregates confirmed 1,390 source rows and unique source keys, 1,364 distinct credentials, 1,389 nonnull street-address values and 1,390 nonnull ZIP values. Both sanitized metadata observations agreed on source update `2026-09-07T08:15:33.000Z`.

Immutable local receipt: `data/business-sources/ct-childcare/preflights/6d85f0a8-02ab-45f3-b177-702defb013a6.json`, 6,572 bytes, SHA-256 `e836c3f753176549f072ea068c9eb6f422e2b5068fea0de3a5a5a884662fccc4`. No facility rows were acquired. This is prerequisite evidence, not an app acquisition operation or a scheduled refresh.

Once the facility connector is validated and enrolled, Co*Tive owns routine acquisition and its durable progress/receipts. Agents return to source validation and connector development after accepted app dispatch; they do not remain occupied waiting for downloads. Existing retained releases are reused for downstream processing. Provider limits remain binding regardless of available local memory, and retries/restart recovery must be implemented and tested before being advertised.

Verification: twelve focused preflight/registry tests passed. The full repository check passed with 1,224 tests passed, 11 skipped and zero failures, including lint, builds and desktop control-plane smoke. Type checking passed, the production dependency audit reported zero vulnerabilities, and all 82 pending production pins remained unchanged. Local full-check log: `data/tmp/ct-childcare-preflight-full-check.log`.

Rollback stops using this new preflight entry point. Preserve receipts and all existing source/national releases; there is no automatic source refresh to undo.
