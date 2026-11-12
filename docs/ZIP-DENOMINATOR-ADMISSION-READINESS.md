# ZIP denominator admission readiness

This immutable, pointer-free local-review release binds the exact 48,194-row ZIP evidence cohort and current production registry inputs. It reports the state of both governed USPS prerequisite routes without acquiring data, changing a pointer, enrolling production, or classifying any ZIP as valid or invalid.

The retained evidence consists of 33,791 same-code Census ZCTAs, 14,361 source-contributed keys outside that ZCTA set, 41 denominator-only keys outside it, and one explicit `00000` placeholder. Across the registry, 47,995 keys have record-level source contribution and 199 are denominator-only. Every one of the 48,194 keys remains USPS-unverified. A ZCTA remains statistical geography and is never treated as a USPS delivery boundary.

The PostalPro Area/District route requires a verified immutable release, an exact source month, USPS written-permission evidence with a governed reference, and a fresh production plan. The licensed City State route requires an operator-managed projection, exact hash and byte declarations, source month/version, permission reference, all four ZIP-class declarations, and an explicit reviewed status map. City State output remains candidate-only; production admission is not implemented.

The readiness artifact exposes missing inputs as machine-readable arrays. Its authoritative denominator, valid-ZIP count, business count, current-operation count, and completeness percentage remain null. Publication uses only retained local inputs and produces no runtime pointer.

The registered November release is `zip-denominator-admission-readiness-33a09cec0e7a5c4d99f46c59db9acc0349b6f0e7e6da3cead0df9bbb8574d0fb`. Its manifest SHA-256 is `65d1d5e9e63cde664af27c4a04179866703322bbf88154f415aef0c82d9d0519` and its readiness SHA-256 is `33a09cec0e7a5c4d99f46c59db9acc0349b6f0e7e6da3cead0df9bbb8574d0fb`.

The release binds the November business registry and the manifest, summary, and exact row artifact from `zip-denominator-gap-cohort-20261112095233801-71dcb2b90b6d`. The verifier checks that the cohort summary and readiness report refer to the same registry pointer, manifest, and ZIP artifact. It also binds the licensed City State admission contract SHA-256 `060fac00a236e4a59f638edf9302e191309247f3234778e0128730699f2c3067`. Earlier readiness releases remain immutable historical observations. The blocked status applies to USPS denominator admission only.

```powershell
node scripts/build-zip-denominator-admission-readiness.mjs
node scripts/verify-zip-denominator-admission-readiness.mjs data/zip-denominator-admission-readiness/releases/<release-id>/manifest.json
```
