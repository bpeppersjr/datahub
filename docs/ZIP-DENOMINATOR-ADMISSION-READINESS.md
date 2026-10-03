# ZIP denominator admission readiness

This immutable, pointer-free local-review release binds the exact 48,194-row ZIP evidence cohort and current production registry inputs. It reports the state of both governed USPS prerequisite routes without acquiring data, changing a pointer, enrolling production, or classifying any ZIP as valid or invalid.

The retained evidence consists of 33,791 same-code Census ZCTAs, 14,361 source-contributed keys outside that ZCTA set, 41 denominator-only keys outside it, and one explicit `00000` placeholder. Across the registry, 47,995 keys have record-level source contribution and 199 are denominator-only. Every one of the 48,194 keys remains USPS-unverified. A ZCTA remains statistical geography and is never treated as a USPS delivery boundary.

The PostalPro Area/District route requires a verified immutable release, an exact source month, USPS written-permission evidence with a governed reference, and a fresh production plan. The licensed City State route requires an operator-managed projection, exact hash and byte declarations, source month/version, permission reference, all four ZIP-class declarations, and an explicit reviewed status map. City State output remains candidate-only; production admission is not implemented.

The readiness artifact exposes missing inputs as machine-readable arrays. Its authoritative denominator, valid-ZIP count, business count, current-operation count, and completeness percentage remain null. Publication uses only retained local inputs and produces no runtime pointer.

Registered release: `zip-denominator-admission-readiness-fb056804a473ed6b9425d5ec0590bb98282e7e15b3b31fb65762cc1c768bf1bb`; manifest SHA-256 `dc4d9e377d924ae400d7d7e96a5187ced4fec4d0331fd8a205eaa7655788e3fa`.

```powershell
node scripts/build-zip-denominator-admission-readiness.mjs
node scripts/verify-zip-denominator-admission-readiness.mjs data/zip-denominator-admission-readiness/releases/<release-id>/manifest.json
```
