# Proposed retained-data production reconciliation — October 6, 2026

Plan 214 is a planning-only successor to Plan 213 after integrating the governed v3.0 exact-ZIP matrix into the application runtime, state heat map, and national objective-readiness reporting. It does not authorize or perform production work.

- Run ID: `production-cms-directories-20261006-214`
- Plan confirmation SHA-256: `08ecfc80cb55801732870f66b75145ec078673264778e6a1801e27eda1342d7d`
- Plan file SHA-256: `c41b8f5ffae5c857684a002055f07febdc948bacdf1c494efec3bac71f025743`
- Predecessor plan: `production-cms-directories-20261006-213`

The pointer-free v3.0 matrix release is `national-exact-zip-industry-evidence-matrix-e5287a4adc3f9b657499135d2f5641dac05b67359d9dbaf14ad4b72d598c97c9`, with manifest SHA-256 `07192a24eae937d5fbe3d58f4c877d5cfefcc70d3f2ca24237b450d316d111f7`. It preserves 48,194 ZIP5 rows and contains 51 dimensions and 2,457,894 cells. The state projection conserves the same cells across 51 state/DC scopes, five territories, and four explicit unresolved/special scopes.

The New York dimension conserves 1,500 positive ZIPs and 24,280 source-reported license-location address observations. The annual source snapshot is stale non-active reporting, not verified current operation. Address evidence is not a physical-site or unique-business count, and the dimension is nonadditive with `ny_retail_food_location_profiles`. Record evidence remains local-review-only; aggregate use requires OPEN-NY attribution and semantic limitations.

Read-only preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The same four retained selections and `national-12g` profile remain pinned. Available disk was 76,507,402,240 bytes against a 13,309,329,011-byte requirement.

No acquisition, network request, reconciliation execution, production enrollment, or mutable pointer write occurred. Plan 213 and earlier plans are superseded without execution. Any execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261006-214 --expected-plan-sha256 08ecfc80cb55801732870f66b75145ec078673264778e6a1801e27eda1342d7d
```
