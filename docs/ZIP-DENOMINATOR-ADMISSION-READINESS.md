# ZIP denominator admission readiness

This immutable, pointer-free local-review release binds the exact 48,194-row ZIP evidence cohort and current production registry inputs. It reports the state of both governed USPS prerequisite routes without acquiring data, changing a pointer, enrolling production, or classifying any ZIP as valid or invalid.

The retained evidence consists of 33,791 same-code Census ZCTAs, 14,361 source-contributed keys outside that ZCTA set, 41 denominator-only keys outside it, and one explicit `00000` placeholder. Across the registry, 47,995 keys have record-level source contribution and 199 are denominator-only. Every one of the 48,194 keys remains USPS-unverified. A ZCTA remains statistical geography and is never treated as a USPS delivery boundary.

The PostalPro Area/District route requires a verified immutable release, an exact source month, USPS written-permission evidence with a governed reference, and a fresh production plan. The licensed City State route requires an operator-managed projection, exact hash and byte declarations, source month/version, permission reference, all four ZIP-class declarations, and an explicit reviewed status map. City State output remains candidate-only; production admission is not implemented.

The readiness artifact exposes missing inputs as machine-readable arrays. Its authoritative denominator, valid-ZIP count, business count, current-operation count, and completeness percentage remain null. Publication uses only retained local inputs and produces no runtime pointer.

Registered release: `zip-denominator-admission-readiness-54a4c37b3f9f2b0169fa02eb87fa74dc2ae38689106b1bd5f92b48f35a89f33e`; manifest SHA-256 `2f2bad833eedc0cff2b170386c648fcfa13953b3e002d556156fc99fbbb1bfdf`.

The registered replacement binds the current licensed City State admission contract SHA-256 `060fac00a236e4a59f638edf9302e191309247f3234778e0128730699f2c3067` and passes full retained-input replay. It supersedes the historical drifted registration without changing its immutable bytes. The replacement remains blocked, pointer-free, local-review-only evidence: no USPS source was acquired, no validity or deliverability classification was made, and no production state changed.

```powershell
node scripts/build-zip-denominator-admission-readiness.mjs
node scripts/verify-zip-denominator-admission-readiness.mjs data/zip-denominator-admission-readiness/releases/<release-id>/manifest.json
```
